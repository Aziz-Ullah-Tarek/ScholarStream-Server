const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// Admin credentials
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin12345';
const ADMIN_NAME = 'System Administrator';
const ADMIN_PHOTO = 'https://i.pravatar.cc/150?img=68';

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function setupAdmin() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const database = client.db("ScholarStream");
    const usersCollection = database.collection("users");

    // Check if admin already exists
    const existingAdmin = await usersCollection.findOne({ email: ADMIN_EMAIL });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', ADMIN_EMAIL);
      
      // Update to ensure admin role
      await usersCollection.updateOne(
        { email: ADMIN_EMAIL },
        { 
          $set: { 
            role: 'admin',
            updatedAt: new Date()
          } 
        }
      );
      console.log('✅ Admin role updated successfully');
    } else {
      // Create new admin user
      const adminUser = {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        photoURL: ADMIN_PHOTO,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await usersCollection.insertOne(adminUser);
      console.log('✅ Admin user created successfully');
    }

    console.log('\n📧 Admin Credentials:');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('\n⚠️  IMPORTANT: You need to create this user in Firebase Authentication manually or through the frontend registration with these credentials.');
    console.log('   Then the system will recognize them as admin based on the database role.\n');

  } catch (error) {
    console.error('❌ Error setting up admin:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

setupAdmin();
