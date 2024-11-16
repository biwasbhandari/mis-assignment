import Book from "../models/books.js";
import dotenv from "dotenv";
import Order from "../models/order.js";
import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

class BookController {
  static create = async (req, res) => {
    try {
      if (req.method === "GET") {
        return res.render("book", { title: "Book", errors: [] });
      }

      const { title, description, price } = req.body;
      await Book.create({
        title,
        description,
        price,
        image: "",
      });

      res.redirect("/book");
    } catch (error) {
      console.error("Error creating book:", error);
      res.status(500).render("book", {
        title: "Book",
        errors: [{ msg: "Error creating book" }],
      });
    }
  };

  static buy = async (req, res) => {
    try {
      const id = req.params.id;
      const book = await Book.findById(id);

      if (!book) {
        return res.status(404).send("Book not found");
      }

      const uid = uuidv4();

      // Make sure ESEWASECRET is defined
      if (!process.env.ESEWASECRET) {
        throw new Error("ESEWA secret key not configured");
      }

      // Create signature string according to eSewa specs
      const message = `total_amount=${book.price},transaction_uuid=${uid},product_code=EPAYTEST`;

      // Create HMAC using SHA256
      const hash = CryptoJS.HmacSHA256(message, process.env.ESEWASECRET);
      const signature = CryptoJS.enc.Base64.stringify(hash);

      res.render("order", {
        description: book.description,
        image: book.image,
        id: book.id,
        title: book.title,
        uid: uid,
        price: book.price,
        signature: signature,
      });
    } catch (error) {
      console.error("Error processing buy request:", error);
      res.status(500).send("Error processing purchase");
    }
  };

  static verifyEsewa = async (req, res) => {
    try {
      const id = req.params.id;
      const data = req.query.data;

      if (!data) {
        throw new Error("No data received from eSewa");
      }

      // Decode base64 data
      let decodedString = atob(data);
      let decodedData;

      try {
        decodedData = JSON.parse(decodedString);
      } catch (e) {
        throw new Error("Invalid JSON data received from eSewa");
      }

      // Early validation of required fields
      if (
        !decodedData.status ||
        !decodedData.transaction_code ||
        !decodedData.total_amount ||
        !decodedData.transaction_uuid ||
        !decodedData.product_code ||
        !decodedData.signed_field_names
      ) {
        throw new Error("Missing required fields in eSewa response");
      }

      switch (decodedData.status) {
        case "COMPLETE":
          // Verify user session
          if (!req.session?.user?._id) {
            throw new Error("User not authenticated");
          }

          const book = await Book.findById(id);
          if (!book) {
            throw new Error("Book not found");
          }

          // Verify signature
          const message =
            `transaction_code=${decodedData.transaction_code},` +
            `status=${decodedData.status},` +
            `total_amount=${decodedData.total_amount},` +
            `transaction_uuid=${decodedData.transaction_uuid},` +
            `product_code=${decodedData.product_code},` +
            `signed_field_names=${decodedData.signed_field_names}`;

          const hash = CryptoJS.HmacSHA256(message, process.env.ESEWASECRET);
          const calculatedSignature = CryptoJS.enc.Base64.stringify(hash);

          if (calculatedSignature !== decodedData.signature) {
            throw new Error("Invalid signature");
          }

          // Create order
          await Order.create({
            orderedBy: req.session.user._id,
            bookId: book.id,
            quantity: 1,
            price: book.price,
            transactionId: decodedData.transaction_uuid,
            paymentStatus: "COMPLETE",
          });

          res.redirect("/account/login");
          break;

        case "PENDING":
          res.status(202).send("Payment pending");
          break;

        case "FULL_REFUND":
          res.status(200).send("Payment refunded");
          break;

        case "CANCELED":
          res.status(200).send("Payment canceled");
          break;

        default:
          throw new Error(`Unknown payment status: ${decodedData.status}`);
      }
    } catch (error) {
      console.error("Error verifying eSewa payment:", error);
      res.status(400).send(`Payment verification failed: ${error.message}`);
    }
  };
}

export default BookController;
