const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.port || 3000;

app.use(cors({}));
app.use(express.json());

console.log(process.env.DB_USER);

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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // api for savin user
    app.post("/sign-up", async (req, res) => {
      const user = req.body;
      const exist = await usersCollection.findOne({$or : [{email : user.phone},{phone : user.phone}]});
      if(exist){
        return res.status(301).send("user already exist")
      }
      const hashedPin = bcrypt.hashSync(user.pin, 14);
      const result = await usersCollection.insertOne({
        ...user,
        pin: hashedPin,
      });
      res.send({ message: "User created, Aproval pending", result });
    });

    //api for sign in
    app.post("/login", async (req, res) => {
      const { phone, pin } = req.body;

      const user = await usersCollection.findOne({
        $or: [{ email: phone }, { phone: phone }],
      });
      if (!user) {
        return res.status(400).send({ message: "invalid credential" });
      }

      const isMatch = bcrypt.compareSync(pin, user.pin);

      if (!isMatch) {
        return res.status(400).send({ message: "invalid credential" });
      }

      res.send(user);
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

app.get("/", (req, res) => {
  res.send("Nagad is coming");
});

app.listen(port, () => {
  console.log("Nagad server Running On PORT", port);
});
