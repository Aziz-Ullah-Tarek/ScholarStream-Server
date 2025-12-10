const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { verifyToken, isAdmin, isModeratorOrAdmin } = require('./middleware/authMiddleware');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    
    // Database and Collections
    const database = client.db("ScholarStream");
    const scholarshipsCollection = database.collection("scholarships-collection");
    const applicationsCollection = database.collection("applications");
    const usersCollection = database.collection("users");
    const successStoriesCollection = database.collection("success-stories");

    // Store collections in app.locals for middleware access
    app.locals.usersCollection = usersCollection;

    console.log("✅ Successfully connected to MongoDB!");

    // ============= API Routes =============

    // Test Route
    app.get('/', (req, res) => {
      res.send('ScholarStream Backend is Running 🎓');
    });

    // Health Check
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', message: 'Server is healthy' });
    });

    // Check user role
    app.get('/api/users/check-role/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) {
          return res.json({ role: 'student' }); // Default role
        }
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
        if (!scholarship) {
          return res.status(404).json({ message: 'Scholarship not found' });
        }
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

    // ============= Applications Routes =============

    // Get all applications
    app.get('/api/applications', async (req, res) => {
      try {
        const applications = await applicationsCollection.find().toArray();
        res.json(applications);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching applications', error: error.message });
      }
    });

    // Get applications by user email
    app.get('/api/applications/user/:email', async (req, res) => {
      try {
        const applications = await applicationsCollection.find({ userEmail: req.params.email }).toArray();
        res.json(applications);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user applications', error: error.message });
      }
    });

    // Create application
    app.post('/api/applications', async (req, res) => {
      try {
        const result = await applicationsCollection.insertOne(req.body);
        res.status(201).json({ message: 'Application submitted successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error submitting application', error: error.message });
      }
    });

    // Update application status (Moderator/Admin)
    app.patch('/api/applications/:id', async (req, res) => {
      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: req.body.status, feedback: req.body.feedback } }
        );
        res.json({ message: 'Application status updated', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating application', error: error.message });
      }
    });

    // ============= Users API Routes =============

    // Get all users with pagination and filtering (Admin only)
    app.get('/api/users', verifyToken, isAdmin, async (req, res) => {
      try {
        const { page = 1, limit = 10, role, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        const query = {};
        if (role) query.role = role;
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ];
        }

        const users = await usersCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();
        
        const total = await usersCollection.countDocuments(query);

        res.json({
          users,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit))
          }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
      }
    });

    // Get user by email
    app.get('/api/users/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
      }
    });

    // Create or update user (auto-save on login)
    app.post('/api/users', async (req, res) => {
      try {
        const { email, name, photoURL } = req.body;
        
        // Validation
        if (!email) {
          return res.status(400).json({ message: 'Email is required' });
        }

        const userData = {
          email,
          name: name || 'Anonymous',
          photoURL: photoURL || '',
          role: 'student', // Default role
          updatedAt: new Date()
        };

        // Check if user exists
        const existingUser = await usersCollection.findOne({ email });
        
        if (existingUser) {
          // Update existing user (preserve role)
          const result = await usersCollection.updateOne(
            { email },
            { 
              $set: { 
                name: userData.name,
                photoURL: userData.photoURL,
                updatedAt: userData.updatedAt
              } 
            }
          );
          res.json({ 
            message: 'User updated successfully', 
            user: { ...existingUser, ...userData },
            result 
          });
        } else {
          // Create new user
          userData.createdAt = new Date();
          const result = await usersCollection.insertOne(userData);
          res.status(201).json({ 
            message: 'User created successfully', 
            user: userData,
            insertedId: result.insertedId 
          });
        }
      } catch (error) {
        res.status(500).json({ message: 'Error saving user', error: error.message });
      }
    });

    // Update user profile (Own profile or Admin)
    app.put('/api/users/:email', verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const { name, photoURL } = req.body;
        
        // Check if user is updating their own profile or is admin
        const userEmail = req.user.email;
        const requestingUser = await usersCollection.findOne({ email: userEmail });
        
        if (userEmail !== email && requestingUser?.role !== 'admin') {
          return res.status(403).json({ message: 'Forbidden: You can only update your own profile' });
        }

        const updateData = {
          updatedAt: new Date()
        };
        if (name) updateData.name = name;
        if (photoURL !== undefined) updateData.photoURL = photoURL;

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User profile updated successfully', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating user profile', error: error.message });
      }
    });

    // Update user role (Admin only)
    app.patch('/api/users/:email/role', verifyToken, isAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        const { role } = req.body;

        // Validate role
        const validRoles = ['student', 'moderator', 'admin'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ message: 'Invalid role. Must be: student, moderator, or admin' });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { role, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: `User role updated to ${role}`, modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating user role', error: error.message });
      }
    });

    // Delete user (Admin only)
    app.delete('/api/users/:email', verifyToken, isAdmin, async (req, res) => {
      try {
        const { email } = req.params;
        
        // Prevent admin from deleting themselves
        if (email === req.user.email) {
          return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        const result = await usersCollection.deleteOne({ email });
        
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully', deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
      }
    });

    // Get user statistics (Admin only)
    app.get('/api/users/stats/summary', verifyToken, isAdmin, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const studentCount = await usersCollection.countDocuments({ role: 'student' });
        const moderatorCount = await usersCollection.countDocuments({ role: 'moderator' });
        const adminCount = await usersCollection.countDocuments({ role: 'admin' });

        res.json({
          total: totalUsers,
          byRole: {
            student: studentCount,
            moderator: moderatorCount,
            admin: adminCount
          }
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user statistics', error: error.message });
      }
    });

    // ============= Success Stories Routes =============

    // Get all success stories
    app.get('/api/success-stories', async (req, res) => {
      try {
        const stories = await successStoriesCollection.find().toArray();
        res.json(stories);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching success stories', error: error.message });
      }
    });

    // Create success story
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

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});
