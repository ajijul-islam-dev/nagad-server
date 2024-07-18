const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
var jwt = require("jsonwebtoken");
const {
  MongoClient,
  ServerApiVersion,
  Transaction,
  ObjectId,
} = require("mongodb");
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
    const verifyToken = async (req, res, next) => {
      const token = req.headers.token;
      if (!token) {
        return res.send("fobidden acces");
      }

      jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
        req.decoded = decoded;
        if (err) {
          return res.send({ messagr: "invalid or expired token", err });
        }
      });
      const decoded = req.decoded;
      if (decoded) {
        const user = await usersCollection.findOne({ phone: decoded.phone });
        if (user) {
          const isValid =
            (await user.phone) === decoded.phone &&
            user.role.name === decoded.role;
          if (!isValid) {
            return res.send({ message: "forbidden access", status: 403 });
          }
          next();
        }
      }
    };

    // get user --------------------------------------------------------
    app.get("/user",verifyToken, async (req, res) => {
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
    app.get("/users", verifyToken, async (req, res) => {
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

      const token = jwt.sign(
        { phone: user.phone, role: user.role.name },
        process.env.SECRET_TOKEN,
        {
          expiresIn: "1h",
        }
      );
      res.send({ user, token });
    });

    // aprove users----------------------------------------------------------
    app.put("/approve",verifyToken, async (req, res) => {
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

      res.send({ message: "something went worng", status: 400 });
    });

    // Transactions ---------------------------------------------------------
    app.get("/transactions",verifyToken, async (req, res) => {
      const phone = req.query;
      const result = await TransCollection.find({
        $or: [{ senderNumber: phone.phone }, { reciverNumber: phone.phone }],
      }).toArray();
      res.send(result);
    });

    // sendMoney ------------------------------------------------------
    app.put("/send-money",verifyToken, async (req, res) => {
      const info = await req.body;
      const sender = await usersCollection.findOne({
        phone: info.senderNumber,
      });
      const reciver = await usersCollection.findOne({
        phone: info.reciverNumber,
      });

      if(!reciver){
        return res.send({ message: "invalid credential", status: 303 });

      }

      const isMatch = bcrypt.compareSync(info.pin, sender.pin);
      if (!isMatch) {
        return res.send({ message: "invalid credential", status: 301 });
      }



      if (info.amount < 50) {
        return res.send({ message: "lower Amount", status: 300 });
      }

      const fee = info.amount - 5;

      if (info.amount > 100) {
        const senderDoc = {
          $inc: { balance: -info.amount - fee },
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
        const addToTransaction = await TransCollection.insertOne({
          ...info,
          fee,
        });

        return res.send({ message: "success", status: 200 });
      }

      const senderDoc = {
        $inc: { balance: -info.amount },
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

      const addToTransaction = await TransCollection.insertOne(info);
      return res.send({ message: "success", status: 200 });
    });

    // Cash Out -----------------------------------------------------------
    app.put("/cash-out",verifyToken, async (req, res) => {
      const info = await req.body;

      const user = await usersCollection.findOne({
        phone: info.senderNumber,
      });
      const agent = await usersCollection.findOne({
        phone: info.reciverNumber,
      });

      const isMatch = bcrypt.compareSync(info.pin, user.pin);
      if (!isMatch) {
        return res.send({ message: "invalid credential", status: 301 });
      }

      const isAgent =
        (await agent?.role?.name) === "agent" &&
        agent?.role?.status === "approved";
      console.log(isAgent);

      if (!isAgent) {
        return res.send({ message: "invalid Agent Number", status: 302 });
      }

      const commission = (info.amount / 100) * 1.5;
      const addToTransaction = await TransCollection.insertOne({
        ...info,
        fee: commission,
      });
      res.send({ message: "succed", status: 200 });
    });

    // cash-in --------------------------------------------------------
    app.post("/cash-in",verifyToken, async (req, res) => {
      const info = req.body;

      const agent = await usersCollection.findOne({
        phone: info.senderNumber,
      });

      const isAgent =
        (await agent?.role?.name) === "agent" &&
        agent?.role?.status === "approved";

      if (!isAgent) {
        return res.send({ message: "invalid Agent Number", status: 301 });
      }
      const result = await TransCollection.insertOne(info);
      res.send({ message: "succed", status: 200 });
    });

    //  get agent managment req-----------------------------------------
    app.get("/requests",verifyToken, async (req, res) => {
      const { phone } = req.query;
      const query = {
        $or: [{ reciverNumber: phone }, { senderNumber: phone }],
      };
      const result = await TransCollection.find(query).toArray();
      res.send(result);
    });

    // Accept cash in req ----------------------------------------------
    app.put("/accept",verifyToken, async (req, res) => {
      const info = req.body;

      if (info.type === "cash-in") {
        const senderDoc = {
          $inc: {
            balance: -info.amount,
          },
        };
        const reciverDoc = {
          $inc: {
            balance: info.amount,
          },
        };
        const senderResult = await usersCollection.updateOne(
          { phone: info.senderNumber },
          senderDoc
        );
        const reciverResult = await usersCollection.updateOne(
          { phone: info.reciverNumber },
          reciverDoc
        );

        const transDoc = {
          $set: {
            status: "approved",
          },
        };
        const updateTransaction = await TransCollection.updateOne(
          { _id: new ObjectId(info._id) },
          transDoc
        );
        return res.send({ message: "succedx", status: 200 });
      }

      if (info.type === "cash-out") {
        const commission = (info.amount / 100) * 1.5;

        const userDoc = {
          $inc: {
            balance: -info.amount - commission,
          },
        };
        const agentDoc = {
          $inc: {
            balance: info.amount + commission,
          },
        };
        const userResult = await usersCollection.updateOne(
          { phone: info.senderNumber },
          userDoc
        );
        const agentResult = await usersCollection.updateOne(
          { phone: info.reciverNumber },
          agentDoc
        );

        const transDoc = {
          $set: {
            status: "approved",
          },
        };
        const updateTransaction = await TransCollection.updateOne(
          { _id: new ObjectId(info._id) },
          transDoc
        );

        return res.send({ message: "succed", status: 200 });
      }
      res.send({ message: "something went wrong", status: 400 });
    });

    // Block --------------------------------------------------
    app.put("/block",verifyToken, async (req, res) => {
      const id = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id.id) },
        { $set: { "role.status": "blocked" } }
      );
      res.send(result);
    });

    // Unblock --------------------------------------------------
    app.put("/unBlock",verifyToken, async (req, res) => {
      const id = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id.id) },
        { $set: { "role.status": "approved" } }
      );
      res.send(result);
    });

    // Search by name----------------------------------------------
    app.get("/search",verifyToken, async (req, res) => {
      const text = req.query;
      const result = await usersCollection
        .find({ name: { $regex: text.s, $options: "i" } })
        .toArray();
      res.send(result);
    });

    // Search by role name----------------------------------------------
    app.get("/sort",verifyToken, async (req, res) => {
      const text = req.query;
      const result = await usersCollection
        .find({ "role.name": text.s })
        .toArray();
      res.send(result);
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
