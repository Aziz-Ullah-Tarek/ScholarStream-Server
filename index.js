const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { verifyToken, isAdmin, isModeratorOrAdmin } = require('./middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    
    const database = client.db("ScholarStream");
    const scholarshipsCollection = database.collection("scholarships-collection");
    const applicationsCollection = database.collection("applications");
    const usersCollection = database.collection("users");
    const successStoriesCollection = database.collection("success-stories");
    const reviewsCollection = database.collection("reviews");

    app.locals.usersCollection = usersCollection;
    console.log("✅ Successfully connected to MongoDB!");

    // Test & Health Routes
    app.get('/', (req, res) => {
      res.send('ScholarStream Backend is Running 🎓');
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'OK', message: 'Server is healthy' });
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
    
    // Get all scholarships
    app.get('/api/scholarships', async (req, res) => {
      try {
        const scholarships = await scholarshipsCollection.find().toArray();
        res.json(scholarships);
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

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});
