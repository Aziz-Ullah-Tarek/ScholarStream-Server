const admin = require('../firebaseAdmin');

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
    }

    const userEmail = req.user.email;
    const usersCollection = req.app.locals.usersCollection;
    
    const user = await usersCollection.findOne({ email: userEmail });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({ message: 'Error checking admin status', error: error.message });
  }
};

// Middleware to check if user is moderator or admin
const isModeratorOrAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
    }

    const userEmail = req.user.email;
    const usersCollection = req.app.locals.usersCollection;
    
    const user = await usersCollection.findOne({ email: userEmail });
    
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      return res.status(403).json({ message: 'Forbidden: Moderator or Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Moderator/Admin check error:', error);
    return res.status(500).json({ message: 'Error checking user role', error: error.message });
  }
};

module.exports = { verifyToken, isAdmin, isModeratorOrAdmin };
