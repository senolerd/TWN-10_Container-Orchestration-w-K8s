let express = require('express');
let path = require('path');
let fs = require('fs');
let MongoClient = require('mongodb').MongoClient;
let bodyParser = require('body-parser');
let app = express();


//////////////////////////////////////////////////////////////////////////
// This part is added by me to make it a little k8s friendly. Instead of hard coded credentials
// read from /secrets
const mongoHost = process.env.MONGO_HOST || 'localhost';
const mongoPort = process.env.MONGO_PORT || '27017';

try {
  // .trim() removes hidden newlines (\n) often added by text editors or Docker secrets
  mongoUser = fs.readFileSync('/secrets/mongo-root', 'utf8').trim();
  mongoPass = fs.readFileSync('/secrets/mongo-pass', 'utf8').trim();
} catch (error) {
  console.error('Dramatic Error: Could not read MongoDB credentials:', error.message);
  process.exit(1); // Stop the server immediately if credentials are missing
}
////////////////////////////////////////////////////////////////////////// 


app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, "index.html"));
  });

app.get('profile-picture', function (req, res) {
  let img = fs.readFileSync(path.join(__dirname, "images/profile-1.jpg"));
  res.writeHead(200, {'Content-Type': 'image/jpg' });
  res.end(img, 'binary');
});

// use when starting application locally with node command
let mongoUrl = `mongodb://${mongoUser}:${mongoPass}@${mongoHost}:${mongoPort}`;

// use when starting application as docker container, part of docker-compose
let mongoUrlDockerCompose = "mongodb://admin:password@mongodb";

// pass these options to mongo client connect request to avoid DeprecationWarning for current Server Discovery and Monitoring engine
let mongoClientOptions = { useNewUrlParser: true, useUnifiedTopology: true };

// "user-account" in demo with docker
let databaseName = "user-account";
let collectionName = "users";

app.get('get-profile', function (req, res) {
  let response = {};
  // Connect to the db using local application or docker compose variable in connection properties
  MongoClient.connect(mongoUrl, mongoClientOptions, function (err, client) {
    if (err) throw err;

    let db = client.db(databaseName);

    let myquery = { userid: 1 };

    db.collection(collectionName).findOne(myquery, function (err, result) {
      if (err) throw err;
      response = result;
      client.close();

      // Send response
      res.send(response ? response : {});
    });
  });
});

app.post('update-profile', function (req, res) {
  let userObj = req.body;
  // Connect to the db using local application or docker compose variable in connection properties
  MongoClient.connect(mongoUrlLocal, mongoClientOptions, function (err, client) {
    if (err) throw err;

    let db = client.db(databaseName);
    userObj['userid'] = 1;

    let myquery = { userid: 1 };
    let newvalues = { $set: userObj };

    db.collection(collectionName).updateOne(myquery, newvalues, {upsert: true}, function(err, res) {
      if (err) throw err;
      client.close();
    });

  });
  // Send response
  res.send(userObj);
});

app.listen(3000, '0.0.0.0', function () {
  console.log("app listening on port 3000!");
});

