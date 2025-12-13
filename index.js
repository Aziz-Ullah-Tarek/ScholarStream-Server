const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { 
  verifyToken, 
  isAdmin, 
  isModeratorOrAdmin, 
  verifyAdmin, 
  verifyModerator 
} = require('./middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration for both local and production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow any Vercel preview deployment or allowed origins
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Global database and collections
let database;
let scholarshipsCollection;
let applicationsCollection;
let usersCollection;
let successStoriesCollection;
let reviewsCollection;
let wishlistCollection;

async function run() {
  try {
    await client.connect();
    
    database = client.db("ScholarStream");
    scholarshipsCollection = database.collection("scholarships-collection");
    applicationsCollection = database.collection("applications");
    usersCollection = database.collection("users");
    successStoriesCollection = database.collection("success-stories");
    reviewsCollection = database.collection("reviews");
    wishlistCollection = database.collection("wishlist");

    app.locals.usersCollection = usersCollection;
    console.log("✅ Successfully connected to MongoDB!");
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}

// Test & Health Routes (available immediately)
app.get('/', (req, res) => {
  res.send('ScholarStream Backend is Running 🎓');
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

// Middleware to ensure database is connected
app.use(async (req, res, next) => {
  if (!isConnected) {
    await connectToDatabase();
  }
  next();
});

    // Check user role
    app.get('/api/users/check-role/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) return res.json({ role: 'student' });
        res.json({ role: user.role || 'student' });
      } catch (error) {
        res.status(500).json({ message: 'Error checking user role', error: error.message });
      }
    });

    // ============= Scholarships Routes =============
    
    /**
     * GET /api/scholarships
     * 
     * Get all scholarships with advanced search, filter, sort, and pagination
     * 
     * Query Parameters:
     * - page (number): Page number for pagination (default: 1)
     * - limit (number): Number of items per page (default: 10)
     * - search (string): Search by scholarship name, university name, or degree
     * - country (string): Filter by university country
     * - category (string): Filter by subject category
     * - sortBy (string): Sort field - 'applicationFees' or 'postDate' (default: 'postDate')
     * - sortOrder (string): Sort order - 'asc' or 'desc' (default: 'desc')
     * - format (string): 'full' for pagination data, omit for backward compatibility (just array)
     * 
     * Example: /api/scholarships?page=1&limit=10&search=Engineering&country=USA&sortBy=applicationFees&sortOrder=asc&format=full
     * 
     * Response: Array (default) or { scholarships: [], pagination: {}, filters: {} } (with format=full)
     */
    app.get('/api/scholarships', async (req, res) => {
      try {
        const { 
          page, 
          limit, 
          search = '', 
          country = '', 
          category = '', 
          sortBy = 'postDate', 
          sortOrder = 'desc',
          format = ''
        } = req.query;

        // Check if any query parameters are provided (except format)
        const hasQueryParams = page || limit || search || country || category || 
                               (sortBy && sortBy !== 'postDate') || (sortOrder && sortOrder !== 'desc');

        // Build query object
        const query = {};

        // Search by scholarship name, university name, or degree
        if (search) {
          query.$or = [
            { scholarshipName: { $regex: search, $options: 'i' } },
            { universityName: { $regex: search, $options: 'i' } },
            { degree: { $regex: search, $options: 'i' } }
          ];
        }

        // Filter by country
        if (country) {
          query.universityCountry = { $regex: country, $options: 'i' };
        }

        // Filter by category (subject category)
        if (category) {
          query.subjectCategory = { $regex: category, $options: 'i' };
        }

        // Build sort object
        const sortOptions = {};
        if (sortBy === 'applicationFees') {
          sortOptions.applicationFees = sortOrder === 'asc' ? 1 : -1;
        } else if (sortBy === 'postDate') {
          sortOptions.postDate = sortOrder === 'asc' ? 1 : -1;
        } else {
          // Default sort by post date descending
          sortOptions.postDate = -1;
        }

        // If no pagination params provided, return all results (backward compatibility)
        if (!hasQueryParams && format !== 'full') {
          const scholarships = await scholarshipsCollection
            .find(query)
            .sort(sortOptions)
            .toArray();
          
          return res.json(scholarships);
        }

        // Calculate pagination
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const skip = (pageNum - 1) * limitNum;

        // Execute query with pagination
        const scholarships = await scholarshipsCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .toArray();

        // Get total count for pagination
        const total = await scholarshipsCollection.countDocuments(query);

        // Send response with pagination metadata
        res.json({
          scholarships,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            hasMore: pageNum * limitNum < total
          },
          filters: {
            search,
            country,
            category,
            sortBy,
            sortOrder
          }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching scholarships', error: error.message });
      }
    });

    // Get scholarship by ID
    app.get('/api/scholarships/:id', async (req, res) => {
      try {
        const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!scholarship) return res.status(404).json({ message: 'Scholarship not found' });
        res.json(scholarship);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching scholarship', error: error.message });
      }
    });

    // Create scholarship (Admin only)
    app.post('/api/scholarships', verifyToken, isAdmin, async (req, res) => {
      try {
        const result = await scholarshipsCollection.insertOne(req.body);
        res.status(201).json({ message: 'Scholarship created successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error creating scholarship', error: error.message });
      }
    });

    // Update scholarship (Admin only)
    app.put('/api/scholarships/:id', verifyToken, isAdmin, async (req, res) => {
      try {
        const result = await scholarshipsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body }
        );
        res.json({ message: 'Scholarship updated successfully', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating scholarship', error: error.message });
      }
    });

    // Delete scholarship (Admin only)
    app.delete('/api/scholarships/:id', verifyToken, isAdmin, async (req, res) => {
      try {
        const result = await scholarshipsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ message: 'Scholarship deleted successfully', deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting scholarship', error: error.message });
      }
    });

    // Get related scholarships (by category)
    app.get('/api/scholarships/:id/related', async (req, res) => {
      try {
        const currentScholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!currentScholarship) return res.status(404).json({ message: 'Scholarship not found' });

        // Find scholarships with same subject category, excluding current one
        const relatedScholarships = await scholarshipsCollection
          .find({
            _id: { $ne: new ObjectId(req.params.id) },
            subjectCategory: currentScholarship.subjectCategory
          })
          .limit(4)
          .toArray();

        res.json(relatedScholarships);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching related scholarships', error: error.message });
      }
    });

    // ============= Wishlist Routes =============

    // ========== REVIEW ENDPOINTS ==========
    // Get all reviews for a scholarship
    app.get('/api/reviews/:scholarshipId', async (req, res) => {
      try {
        const { scholarshipId } = req.params;
        const reviews = await reviewsCollection
          .find({ scholarshipId })
          .sort({ reviewDate: -1 })
          .toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch reviews', error: error.message });
      }
    });

    // Get all reviews by a specific user (authenticated)
    app.get('/api/reviews/user/:email', verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const reviews = await reviewsCollection
          .find({ userEmail: email })
          .sort({ reviewDate: -1 })
          .toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch user reviews', error: error.message });
      }
    });

    // Add a new review (authenticated)
    app.post('/api/reviews', verifyToken, async (req, res) => {
      try {
        const { scholarshipId, scholarshipName, universityName, userName, userEmail, userImage, ratingPoint, reviewComment } = req.body;

        // Validate required fields
        if (!scholarshipId || !scholarshipName || !universityName || !userName || !userEmail || !ratingPoint || !reviewComment) {
          return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already reviewed this scholarship
        const existingReview = await reviewsCollection.findOne({ scholarshipId, userEmail });
        if (existingReview) {
          return res.status(400).json({ message: 'You have already reviewed this scholarship' });
        }

        const newReview = {
          scholarshipId,
          scholarshipName,
          universityName,
          userName,
          userEmail,
          userImage: userImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=26CCC2&color=fff`,
          ratingPoint: parseInt(ratingPoint),
          reviewComment,
          reviewDate: new Date().toISOString()
        };

        const result = await reviewsCollection.insertOne(newReview);
        res.status(201).json({ message: 'Review added successfully', reviewId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Failed to add review', error: error.message });
      }
    });

    // Update a review (authenticated)
    app.put('/api/reviews/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { ratingPoint, reviewComment } = req.body;
        const userEmail = req.user.email;

        // Validate fields
        if (!ratingPoint || !reviewComment) {
          return res.status(400).json({ message: 'Rating and comment are required' });
        }

        // Check if review exists and belongs to the user
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }
        if (review.userEmail !== userEmail) {
          return res.status(403).json({ message: 'You can only edit your own reviews' });
        }

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: { 
              ratingPoint: parseInt(ratingPoint), 
              reviewComment,
              reviewDate: new Date().toISOString()
            } 
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: 'Review not found or no changes made' });
        }

        res.json({ message: 'Review updated successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Failed to update review', error: error.message });
      }
    });

    // Delete a review (authenticated)
    app.delete('/api/reviews/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email;

        // Check if review exists and belongs to the user
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }
        if (review.userEmail !== userEmail) {
          return res.status(403).json({ message: 'You can only delete your own reviews' });
        }

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Review not found' });
        }

        res.json({ message: 'Review deleted successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Failed to delete review', error: error.message });
      }
    });

    // ========== WISHLIST ENDPOINTS ==========
    // Get user's wishlist
    app.get('/api/wishlist/:email', verifyToken, async (req, res) => {
      try {
        const wishlistItems = await wishlistCollection
          .find({ userEmail: req.params.email })
          .sort({ addedAt: -1 })
          .toArray();
        res.json(wishlistItems);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching wishlist', error: error.message });
      }
    });

    // Add to wishlist
    app.post('/api/wishlist', verifyToken, async (req, res) => {
      try {
        const { userEmail, scholarshipId, scholarshipName, universityName, universityImage, applicationFees, degree } = req.body;
        
        // Check if already in wishlist
        const existing = await wishlistCollection.findOne({ userEmail, scholarshipId });
        if (existing) {
          return res.status(400).json({ message: 'Scholarship already in wishlist' });
        }

        const wishlistItem = {
          userEmail,
          scholarshipId,
          scholarshipName,
          universityName,
          universityImage,
          applicationFees,
          degree,
          addedAt: new Date()
        };

        const result = await wishlistCollection.insertOne(wishlistItem);
        res.status(201).json({ message: 'Added to wishlist successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error adding to wishlist', error: error.message });
      }
    });

    // Remove from wishlist
    app.delete('/api/wishlist/:id', verifyToken, async (req, res) => {
      try {
        const result = await wishlistCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Wishlist item not found' });
        }
        res.json({ message: 'Removed from wishlist successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error removing from wishlist', error: error.message });
      }
    });

    // Check if scholarship is in wishlist
    app.get('/api/wishlist/check/:email/:scholarshipId', verifyToken, async (req, res) => {
      try {
        const item = await wishlistCollection.findOne({
          userEmail: req.params.email,
          scholarshipId: req.params.scholarshipId
        });
        res.json({ inWishlist: !!item, wishlistItem: item });
      } catch (error) {
        res.status(500).json({ message: 'Error checking wishlist', error: error.message });
      }
    });

    // ============= Stripe Payment Routes =============

    // Create payment intent
    app.post('/api/create-payment-intent', verifyToken, async (req, res) => {
      try {
        const { amount, scholarshipName } = req.body;

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // Stripe expects amount in cents
          currency: 'usd',
          description: `Scholarship Application: ${scholarshipName}`,
          metadata: {
            userEmail: req.user.email,
            scholarshipName: scholarshipName
          },
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ message: 'Error creating payment intent', error: error.message });
      }
    });

    // ============= Applications Routes =============

    app.get('/api/applications', async (req, res) => {
      try {
        const applications = await applicationsCollection.find().toArray();
        res.json(applications);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching applications', error: error.message });
      }
    });

    // Get application by ID
    app.get('/api/applications/:id', async (req, res) => {
      try {
        const application = await applicationsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!application) return res.status(404).json({ message: 'Application not found' });
        res.json(application);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching application', error: error.message });
      }
    });

    app.get('/api/applications/user/:email', async (req, res) => {
      try {
        const applications = await applicationsCollection.find({ userEmail: req.params.email }).toArray();
        res.json(applications);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user applications', error: error.message });
      }
    });

    app.post('/api/applications', async (req, res) => {
      try {
        const result = await applicationsCollection.insertOne(req.body);
        res.status(201).json({ message: 'Application submitted successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error submitting application', error: error.message });
      }
    });

    // Update application status (Moderator/Admin)
    app.patch('/api/applications/:id/status', verifyToken, isModeratorOrAdmin, async (req, res) => {
      try {
        const { applicationStatus, feedback } = req.body;
        const updateData = { applicationStatus };
        if (feedback) updateData.feedback = feedback;

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updateData }
        );
        res.json({ message: 'Application status updated', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating application', error: error.message });
      }
    });

    app.patch('/api/applications/:id/payment', verifyToken, async (req, res) => {
      try {
        const { paymentStatus } = req.body;
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { paymentStatus } }
        );
        res.json({ message: 'Payment status updated', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating payment status', error: error.message });
      }
    });

    app.delete('/api/applications/:id', verifyToken, isAdmin, async (req, res) => {
      try {
        const result = await applicationsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ message: 'Application deleted successfully', deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting application', error: error.message });
      }
    });

    // Get application statistics (Admin)
    app.get('/api/applications/stats/summary', verifyToken, isAdmin, async (req, res) => {
      try {
        const total = await applicationsCollection.countDocuments();
        const pending = await applicationsCollection.countDocuments({ applicationStatus: 'pending' });
        const processing = await applicationsCollection.countDocuments({ applicationStatus: 'processing' });
        const completed = await applicationsCollection.countDocuments({ applicationStatus: 'completed' });
        const rejected = await applicationsCollection.countDocuments({ applicationStatus: 'rejected' });

        res.json({
          total,
          byStatus: { pending, processing, completed, rejected }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching statistics', error: error.message });
      }
    });

    // ============= Reviews Routes =============

    app.get('/api/reviews', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find().sort({ reviewDate: -1 }).toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching reviews', error: error.message });
      }
    });

    app.get('/api/reviews/scholarship/:scholarshipId', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ scholarshipId: req.params.scholarshipId }).sort({ reviewDate: -1 }).toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching scholarship reviews', error: error.message });
      }
    });

    app.get('/api/reviews/user/:email', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ userEmail: req.params.email }).sort({ reviewDate: -1 }).toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user reviews', error: error.message });
      }
    });

    app.post('/api/reviews', verifyToken, async (req, res) => {
      try {
        const reviewData = { ...req.body, reviewDate: new Date().toISOString() };
        const result = await reviewsCollection.insertOne(reviewData);
        res.status(201).json({ message: 'Review submitted successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error submitting review', error: error.message });
      }
    });

    app.put('/api/reviews/:id', verifyToken, async (req, res) => {
      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!review) return res.status(404).json({ message: 'Review not found' });
        if (review.userEmail !== req.user.email) return res.status(403).json({ message: 'You can only edit your own reviews' });

        const { ratingPoint, reviewComment } = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { ratingPoint, reviewComment, updatedAt: new Date().toISOString() } }
        );
        res.json({ message: 'Review updated successfully', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating review', error: error.message });
      }
    });

    app.delete('/api/reviews/:id', verifyToken, async (req, res) => {
      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!review) return res.status(404).json({ message: 'Review not found' });

        const user = await usersCollection.findOne({ email: req.user.email });
        if (review.userEmail !== req.user.email && user?.role !== 'admin') {
          return res.status(403).json({ message: 'You can only delete your own reviews' });
        }

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ message: 'Review deleted successfully', deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting review', error: error.message });
      }
    });

    // Get review statistics
    app.get('/api/reviews/stats/:scholarshipId', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ scholarshipId: req.params.scholarshipId }).toArray();
        
        if (reviews.length === 0) {
          return res.json({ totalReviews: 0, averageRating: 0, ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
        }

        const totalRating = reviews.reduce((sum, review) => sum + review.ratingPoint, 0);
        const averageRating = (totalRating / reviews.length).toFixed(1);
        const ratingDistribution = reviews.reduce((acc, review) => {
          acc[review.ratingPoint] = (acc[review.ratingPoint] || 0) + 1;
          return acc;
        }, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

        res.json({ totalReviews: reviews.length, averageRating: parseFloat(averageRating), ratingDistribution });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching review statistics', error: error.message });
      }
    });

    // ============= Users Routes =============

    // Get all users with pagination (Admin)
    app.get('/api/users', verifyToken, isAdmin, async (req, res) => {
      try {
        const { page = 1, limit = 10, role, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {};
        if (role) query.role = role;
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ];
        }

        const users = await usersCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
        const total = await usersCollection.countDocuments(query);

        res.json({
          users,
          pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
      }
    });

    app.get('/api/users/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
      }
    });

    app.post('/api/users', async (req, res) => {
      try {
        const { email, name, photoURL } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const userData = {
          email,
          name: name || 'Anonymous',
          photoURL: photoURL || '',
          role: 'student',
          updatedAt: new Date()
        };

        const existingUser = await usersCollection.findOne({ email });
        
        if (existingUser) {
          const result = await usersCollection.updateOne(
            { email },
            { $set: { name: userData.name, photoURL: userData.photoURL, updatedAt: userData.updatedAt } }
          );
          res.json({ message: 'User updated successfully', user: { ...existingUser, ...userData }, result });
        } else {
          userData.createdAt = new Date();
          const result = await usersCollection.insertOne(userData);
          res.status(201).json({ message: 'User created successfully', user: userData, insertedId: result.insertedId });
        }
      } catch (error) {
        res.status(500).json({ message: 'Error saving user', error: error.message });
      }
    });

    app.put('/api/users/:email', verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const { name, photoURL } = req.body;
        
        const userEmail = req.user.email;
        const requestingUser = await usersCollection.findOne({ email: userEmail });
        
        if (userEmail !== email && requestingUser?.role !== 'admin') {
          return res.status(403).json({ message: 'Forbidden: You can only update your own profile' });
        }

        const updateData = { updatedAt: new Date() };
        if (name) updateData.name = name;
        if (photoURL !== undefined) updateData.photoURL = photoURL;

        const result = await usersCollection.updateOne({ email }, { $set: updateData });
        if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User profile updated successfully', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating user profile', error: error.message });
      }
    });

    // Update user role (Admin)
    app.patch('/api/users/:email/role', verifyToken, isAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const { role } = req.body;

        const validRoles = ['student', 'moderator', 'admin'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ message: 'Invalid role. Must be: student, moderator, or admin' });
        }

        const result = await usersCollection.updateOne({ email }, { $set: { role, updatedAt: new Date() } });
        if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: `User role updated to ${role}`, modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating user role', error: error.message });
      }
    });

    app.delete('/api/users/:email', verifyToken, isAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        if (email === req.user.email) return res.status(400).json({ message: 'You cannot delete your own account' });

        const result = await usersCollection.deleteOne({ email });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully', deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
      }
    });

   


     // Get user statistics (Admin)
    app.get('/api/users/stats/summary', verifyToken, isAdmin, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const studentCount = await usersCollection.countDocuments({ role: 'student' });
        const moderatorCount = await usersCollection.countDocuments({ role: 'moderator' });
        const adminCount = await usersCollection.countDocuments({ role: 'admin' });

        res.json({
          total: totalUsers,
          byRole: { student: studentCount, moderator: moderatorCount, admin: adminCount }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user statistics', error: error.message });
      }
    });

    // ============= Success Stories Routes =============

    app.get('/api/success-stories', async (req, res) => {
      try {
        const stories = await successStoriesCollection.find().toArray();
        res.json(stories);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching success stories', error: error.message });
      }
    });

    app.post('/api/success-stories', async (req, res) => {
      try {
        const result = await successStoriesCollection.insertOne(req.body);
        res.status(201).json({ message: 'Success story created', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error creating success story', error: error.message });
      }
    });

// Initialize database connection
let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return;
  }
  
  try {
    await run();
    isConnected = true;
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    throw error;
  }
}

// Connect immediately
connectToDatabase();

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
}

// For Vercel serverless - export the app
module.exports = app;

process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});
