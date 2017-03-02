const bodyParser = require('body-parser');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const {BasicStrategy} = require('passport-http');
const passport = require('passport');


const {DATABASE_URL, PORT} = require('./config');
const {BlogPost, User} = require('./models');

const app = express();

app.use(morgan('common'));
app.use(bodyParser.json());

mongoose.Promise = global.Promise;

//-----------------------------------------------******STRATEGIES******------------------------------------//

const basicStrategy = new BasicStrategy(function(username, password, cb) {
  let user;
  User
    .findOne({username: username})
    .exec()
    .then(_user => {
      user = _user;
      if (!user) {
        return cb(null, false, {message: 'Incorrect username'});
      }
      return user.validatePassword(password);
    })
    .then(isValid => {
      console.log(typeof isValid);
      if (!isValid) {
        return cb(null, false, {message: 'Incorrect password'});
      }
      else {
        return cb(null, user);
      }
    });
});

passport.use(basicStrategy);
app.use(passport.initialize());

//-----------------------------------------------******BLOG ENDPOINTS******------------------------------------//
//-----------------------------------------------GET

app.get('/posts', (req, res) => {
  BlogPost
    .find()
    .exec()
    .then(posts => {
      res.json(posts.map(post => post.apiRepr()));
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({error: 'something went terribly wrong'});
    });
});

app.get('/posts/:id', (req, res) => {
  BlogPost
    .findById(req.params.id)
    .exec()
    .then(post => res.json(post.apiRepr()))
    .catch(err => {
      console.error(err);
      res.status(500).json({error: 'something went horribly awry'});
    });
});

//----------------------------------------------POST

app.post('/posts', passport.authenticate('basic', {session: false}), (req, res) => {
  const requiredFields = ['title', 'content'];
  for (let i=0; i<requiredFields.length; i++) {
    const field = requiredFields[i];
    if (!(field in req.body)) {
      const message = `Missing \`${field}\` in request body`;
      console.error(message);
      return res.status(400).send(message);
    }
  }
  console.log(req);

  BlogPost
    .create({
      title: req.body.title,
      content: req.body.content,
      author: {
        firstName: req.user.firstName,
        lastName: req.user.lastName
      }
    })
    .then(blogPost => res.status(201).json(blogPost.apiRepr()))
    .catch(err => {
        console.error(err);
        res.status(500).json({error: 'Something went wrong'});
    });
});

//---------------------------------------------------PUT

app.put('/posts/:id', passport.authenticate('basic', {session: false}), (req, res) => {
  if (!(req.params.id && req.body.id && req.params.id === req.body.id)) {
    res.status(400).json({
      error: 'Request path id and request body id values must match'
    });
  }

  const updated = {};
  const updateableFields = ['title', 'content', 'author'];
  updateableFields.forEach(field => {
    if (field in req.body) {
      updated[field] = req.body[field];
    }
  });

  BlogPost
    .findByIdAndUpdate(req.params.id, {$set: updated}, {new: true})
    .exec()
    .then(updatedPost => res.status(201).json(updatedPost.apiRepr()))
    .catch(err => res.status(500).json({message: 'Something went wrong'}));
});

//---------------------------------------------------DELETE

app.delete('/posts/:id', passport.authenticate('basic', {session: false}), (req, res) => {
  BlogPost
    .findByIdAndRemove(req.params.id)
    .exec()
    .then(() => {
      res.status(204).json({message: 'success'});
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({error: 'something went terribly wrong'});
    });
});

//-----------------------------------------------******USER ENDPOINTS******------------------------------------//

app.post('/users', (req, res) => {
  const body = req.body;
  const { username, firstName, lastName, password} = req.body;
  if(!("username" in body && "password" in body && "firstName" in body && "lastName" in body)) {
    res.status(400).json({message: "You are missing something!"});
  }
  User
    .find({username})
    .count()
    .exec()
    .then(count => {
      if(count > 0) {
        res.status(400).json({message: "Username already exists"})
      }
      return User.hashPassword(password);
    })
    .then(hash => {
     return User.create({ 
       username: username,
       password: hash,
       firstName: firstName,
       lastName: lastName
       });
    })
    .then(result => {
      res.status(201).json(result.apiRepr());
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({message: "Your error is this: " + err});
    });
});

app.use('*', function(req, res) {
  res.status(404).json({message: 'Not Found'});
});

// closeServer needs access to a server object, but that only
// gets created when `runServer` runs, so we declare `server` here
// and then assign a value to it in run


//-----------------------------------------------******SERVER CONTROLS******------------------------------------//
let server;

// this function connects to our database, then starts the server
function runServer(databaseUrl=DATABASE_URL, port=PORT) {
  return new Promise((resolve, reject) => {
    mongoose.connect(databaseUrl, err => {
      if (err) {
        return reject(err);
      }
      server = app.listen(port, () => {
        console.log(`Your app is listening on port ${port}`);
        resolve();
      })
      .on('error', err => {
        mongoose.disconnect();
        reject(err);
      });
    });
  });
}

// this function closes the server, and returns a promise. we'll
// use it in our integration tests later.
function closeServer() {
  return mongoose.disconnect().then(() => {
     return new Promise((resolve, reject) => {
       console.log('Closing server');
       server.close(err => {
           if (err) {
               return reject(err);
           }
           resolve();
       });
     });
  });
}

// if server.js is called directly (aka, with `node server.js`), this block
// runs. but we also export the runServer command so other code (for instance, test code) can start the server as needed.
if (require.main === module) {
  runServer().catch(err => console.error(err));
}

module.exports = {runServer, app, closeServer};



//post request which has the title and content
//the endpoint checks for an autheticated user via the headers
//if successful, it generates a user on the request complete with hashed passport
//we take the user from the req object and use the document information we want, example: first and last username
//if post req passes all checks, ie required keys, we create new user via mongoose models
//that model is created and we use a method to return to the user
//specific json that we want to expose