import express from "express";
import dotenv from "dotenv";
import connectDb from "./db/connect_db.js";
import auth from "./routes/auth.js";
import home from "./routes/home.js";
import session from "express-session";
import book from "./routes/book.js";
import connectMongoDBSession from "connect-mongodb-session";
import path from "path";

dotenv.config();
const app = express();
const MongoDBStore = connectMongoDBSession(session);

app.use(express.urlencoded({ extended: false }));
app.use("/static", express.static(path.join(process.cwd(), "public")));
app.set("trust proxy", 1);

// Use the same MongoDB URI from environment variables
const mongoDbUri = process.env.MONGODB_URI;

if (!mongoDbUri) {
  console.error("MONGODB_URI is not defined in environment variables");
  process.exit(1);
}

const store = new MongoDBStore(
  {
    uri: mongoDbUri,
    collection: "sessions",
    expiresAfterSeconds: 60 * 60 * 24 * 14,
  },
  function (error) {
    if (error) {
      console.error("Session store connection error:", error);
    }
  }
);

store.on("error", function (error) {
  console.error("MongoDB session store error:", error);
});

app.use(
  session({
    name: "sessionId",
    secret: process.env.SESSION_SECRET || "keyboard cat", // Consider moving this to env vars
    resave: false,
    store: store,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

app.use("/account", auth);
app.use("", home);
app.use("/book", book);

app.set("view engine", "ejs");
app.set("views", "./views");

const PORT = process.env.PORT || 8000;

// Modified database connection
connectDb(mongoDbUri).catch((err) => {
  console.error("Database connection error:", err);
});

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
