const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    app.post('/api/scholarships', async (req, res) => {
      try {
        const result = await scholarshipsCollection.insertOne(req.body);
        res.status(201).json({ message: 'Scholarship created successfully', insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Error creating scholarship', error: error.message });
      }
    });

    // Update scholarship (Admin only)
    app.put('/api/scholarships/:id', async (req, res) => {
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
    app.delete('/api/scholarships/:id', async (req, res) => {
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

    // ============= Users Routes =============

    // Get user by email
    app.get('/api/users/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
      }
    });

    // Create or update user
    app.post('/api/users', async (req, res) => {
      try {
        const user = req.body;
        const result = await usersCollection.updateOne(
          { email: user.email },
          { $set: user },
          { upsert: true }
        );
        res.json({ message: 'User saved successfully', result });
      } catch (error) {
        res.status(500).json({ message: 'Error saving user', error: error.message });
      }
    });

    // Update user role (Admin only)
    app.patch('/api/users/:email/role', async (req, res) => {
      try {
        const result = await usersCollection.updateOne(
          { email: req.params.email },
          { $set: { role: req.body.role } }
        );
        res.json({ message: 'User role updated', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).json({ message: 'Error updating user role', error: error.message });
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
