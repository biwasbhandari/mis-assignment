import mongoose from "mongoose";

async function connectDb(dburl) {
  try {
    await mongoose.connect(dburl);
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
}

export default connectDb;
