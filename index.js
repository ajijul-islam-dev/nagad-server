const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.port || 3000;

app.use(cors({}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wugjgdu.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("nagad");
const usersCollection = database.collection("users");
const TransCollection = database.collection("transactions");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //  verifyToken -----------------------------------------------------
    const verifyToken = (req, res, next) => {
      const token = req.headers.token;
      if (!token) {
        return res.send("fobidden acces");
      }

      jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {});
    };

    // get user --------------------------------------------------------
    app.get("/user", async (req, res) => {
      const token = req.headers.token;
      if (!token) {
        return res.send({ message: "forbidden access", user: null });
      }
      jwt.verify(token, process.env.SECRET_TOKEN, async (err, decoded) => {
        const phone = decoded?.phone;
        const user = await usersCollection.findOne({ phone });
        res.send({ user });
      });
    });

    // get All user -----------------------------------------------------
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // api for saving user to database -----------------------------------
    app.post("/sign-up", async (req, res) => {
      const user = req.body;
      const exist = await usersCollection.findOne({
        $or: [{ email: user.phone }, { phone: user.phone }],
      });
      if (exist) {
        return res.send({ message: "user already exist", status: 301 });
      }
      const hashedPin = bcrypt.hashSync(user.pin, 14);
      const result = await usersCollection.insertOne({
        ...user,
        pin: hashedPin,
      });
      res.send({ message: "User created, Aproval pending", result });
    });

    //api for sign in ----------------------------------------------------
    app.post("/login", async (req, res) => {
      const { phone, pin } = req.body;

      const user = await usersCollection.findOne({
        $or: [{ email: phone }, { phone: phone }],
      });
      if (!user) {
        return res.send({ message: "invalid credential", status: 401 });
      }

      const isMatch = bcrypt.compareSync(pin, user.pin);

      if (!isMatch) {
        return res.send({ message: "invalid credential", status: 401 });
      }

      const token = jwt.sign({ phone: user.phone }, process.env.SECRET_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ user, token });
    });

    // aprove users----------------------------------------------------------
    app.put("/approve", async (req, res) => {
      const phone = await req.body.phone;
      const user = await usersCollection.findOne({ phone });

      if (user.role.name === "agent" && user.role.status === "pending") {
        const updateDoc = {
          $set: {
            balance: 10000,
            "role.status": "approved",
          },
        };
        const result = await usersCollection.updateOne({ phone }, updateDoc);
        return res.send({ message: "updated", result });
      }

      if (user.role.name === "user" && user.role.status === "pending") {
        const updateDoc = {
          $set: {
            balance: 40,
            "role.status": "approved",
          },
        };
        const result = await usersCollection.updateOne({ phone }, updateDoc);
        return res.send({ message: "updated", result });
      }
      if (user.role.name === "admin" && user.role.status === "pending") {
        const updateDoc = {
          $set: {
            "role.status": "approved",
          },
        };
        const result = await usersCollection.updateOne({ phone }, updateDoc);
        return res.send({ message: "updated", result });
      }

      console.log(phone);
      res.send({ phone });
    });

    // Transactions ---------------------------------------------------------
    app.post("/transactions", async (req, res) => {
      const info = await req.body;
      const userPhone = info.userNumber;
      const pin = info.pin;

      const user = await usersCollection.findOne({ phone: userPhone });
      const isMatch = bcrypt.compareSync(pin, user.pin);

      if (!isMatch) {
        return res.send({ message: "invalid credential", status: 301 });
      }

      const result = await TransCollection.insertOne(info);

      res.send({ message: "Request sent", status: 200 });
    });

    // sendMoney ------------------------------------------------------
    app.put("/send-money", async (req, res) => {
      const info = await req.body;
      const sender = await usersCollection.findOne({
        phone: info.senderNumber,
      });
      const reciver = await usersCollection.findOne({
        phone: info.reciverNumber,
      });

    
      const isMatch = bcrypt.compareSync(info.pin, sender.pin);
      if (!isMatch) {
        return res.send({ message: "invalid credential", status: 301 });
      }

      if (info.amount < 50) {
        return res.send({ message: "lower Amount", status: 300 });
      }

      if (info.amount >= 100) {
        const senderDoc = {
          $inc: { balance: -info.amount - 5 },
        };
        const reciverDoc = {
          $inc: { balance: info.amount },
        };

        const senderResult = await usersCollection.updateOne(
          { phone: info.senderNumber },
          senderDoc
        );

        const reciverResult = await usersCollection.updateOne(
          { phone: info.reciverNumber },
          reciverDoc
        );
        return res.send({ message: "success", status: 200 });
      }


      const senderDoc = {
        $inc: { balance: -info.amount},
      };
      const reciverDoc = {
        $inc: { balance: info.amount },
      };

      const senderResult = await usersCollection.updateOne(
        { phone: info.senderNumber },
        senderDoc
      );

      const reciverResult = await usersCollection.updateOne(
        { phone: info.reciverNumber },
        reciverDoc
      );

      return res.send({ message: "success", status: 200 });


    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("Nagad server Running On PORT", port);
});
