const mongoose = require('mongoose');

module.exports = async function connectDB() {
    console.log(process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    
};
