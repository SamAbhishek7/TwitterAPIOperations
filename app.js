const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()
const getfollowerpeopleids = async username => {
  const getthefollowingpeoplequery = `select following_user_id  from follower inner join user on 
    user.user_id=follower.follower_user_id where user.username = '${username}';`
  const followingpeople = await db.all(getthefollowingpeoplequery)
  const arrayofIds = followingpeople.map(eachuser => eachuser.following_user_id)
  return arrayofIds
}
const tweetauthentication = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `select * from tweet inner join follower 
  on tweet.user_id = follower.following_user_id
  where tweet.tweet_id = ${tweetId} and follower_user_id =${userId};`
  const tweet = await db.all(getTweetQuery)
  if (tweet === undefined) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    next()
  }
}
app.post('/register/', async (request, response) => {
  const {username, name, password, gender, location} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`
      const dbResponse = await db.run(createUserQuery)
      const newUserId = dbResponse.lastID
      response.send(`User created successfully`)
    }
  } else {
    response.status = 400
    response.send('User already exists')
  }
})

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'my_secret_key')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'my_secret_key', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}
app.get('/user/tweets/feed', authenticateToken, async (request, response) => {
  const {username} = request
  const followerpeopleids = await getfollowerpeopleids(username)
  const tweets = `select username,tweet,date_time as dateTime from user inner join tweet on user.user_id = tweet.user_id where user.user_id in(${followerpeopleids}) order by date_time desc limit 4; `
  const dbget1 = await db.all(tweets)
  response.send(dbget1)
})
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {userId} = request

  const following = ` SELECT u.name
        FROM user u
      inner  join follower f ON u.user_id = f.following_user_id
        WHERE f.follower_user_id =${userId} `
  const dbusers = await db.all(following)
  response.send(dbusers)
})
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {userId} = request

  const following = `select name from user inner join 
  follower on user.user_id = follower.follower_user_id
  where follower.following_user_id = ${userId}`
  const dbusers = await db.all(following)
  response.send(dbusers)
})
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetauthentication,
  async (request, response) => {
    const {tweetId} = request.params
    const tweetquery = `select tweet, 
(SELECT COUNT() FROM Like WHERE tweet_id= '${tweetId}') AS likes, (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies, date_time AS dateTime
FROM tweet
WHERE tweet.tweet_id = '${tweetId}'`
    const tweet = await db.get(tweetquery)
    response.send(tweet)
  },
)
app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  tweetauthentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {username, userId} = request
 
    const likesquery =
      `select username from user inner join like on like.user_id = user.user_id where tweet_id = ${tweetId} `;
      const likesusers = db.all(likesquery);
      const usersarray = likesusers.map((eachuser)=>
      eachuser.username);
      response.send({likes:usersarray});

  }
);
app.get(
"/tweets/:tweetId/replies/", authenticateToken,
tweetauthentication,
async (request, response) =>{
const { tweetId} = request.params;
const getRepliedQuery = `SELECT name, reply.
FROM user INNER JOIN reply ON user.user_id = reply.user_id
WHERE tweet_id = '${tweetId}';`;
const repliedUsers = await db.all(getRepliedQuery); response.send({ replies: repliedUsers });
}
);

app.get("/user/tweets/", authenticateToken , async (request, response)=>{
const { userId } = request;
const getTweetsQuery=`
SELECT tweet,
COUNT (DISTINCT Like_id) AS likes,
COUNT (DISTINCT reply_id) AS replies,
date_time AS dateTime
FROM tweet LEFT JOIN reply ON tweet. tweet_id = reply.tweet_id LEFT JOIN like ON tweet. tweet_id = like.tweet_id WHERE tweet.user_id = ${userId}
GROUP BY tweet.tweet_id; `;
const tweets = await db.all(getTweetsQuery);
response.send(tweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => { 
const { tweet} = request.body;
const userId = parseInt(request.userId);
const dateTime = new Date().toJSON().substring(0, 19).replace("T"," " )
const createTweetQuery = `INSERT INTO tweet (tweet, user_id, date_time) VALUES ('${tweet}', '${userId}', '${dateTime}')`;
await db.run(createTweetQuery);
response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateToken, async (request, response) => {
const { tweetId } = request.params;
const { userId } = request;
const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}'`;
const tweet = await db.get(getTheTweetQuery);
console.log(tweet);
if (tweet ===undefined) {
response.status(401);
response.send("Invalid Request");
} else {
  const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}'`;
await db.run(deleteTweetQuery);
response.send("Tweet Removed");
}
});
module.exports = app;
