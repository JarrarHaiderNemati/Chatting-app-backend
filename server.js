const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const cors=require('cors');
const Filter=require('bad-words');
const filter=new Filter();
const mongoose = require("mongoose");
const User = require('./models/User');
const Chatted=require('./models/Chatted');
const { timeStamp } = require('console');
const userSockets={}; //Stores the sockets connected
const frontendLink="http://localhost:5173";
require('dotenv').config(); 

//const frontendLink="https://chatmango.netlify.app";

const app=express();
app.use(cors());
app.use(express.json());
const server=http.createServer(app);
const roomUsers={}; //Object of arrays to store all the online users room wise

const io=new Server(server,{
  cors:{
    origin:`${frontendLink}`,
    methods: ['GET', 'POST' , 'PUT' , 'DELETE'],
  },
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("Mongo URI:", process.env.MONGO_URI); 
  console.log("✅ Connected to MongoDB");
}).catch((err) => {
  console.log("Mongo URI:", process.env.MONGO_URI); // Add this
  console.error("❌ MongoDB connection failed:", err);
});

// Signup
app.post("/signup", async (req, res) => {
  const { email, userName, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Username already exists" });

    const newUser = new User({ email, userName, password }); // plain password for now
    await newUser.save();

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  console.log('Inside /login ! ');
  const { email, password } = req.body;
  try {
    console.log('Inside try block of /login ! ');
    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    res.status(200).json({ message: "Login successful" });
  } catch (err) {
    console.log('Inside catch block of /login ! ');
    res.status(500).json({ message: "Server error" });
  }
});

app.get('/listOfUsers',async(req,res)=>{ //Retrieves list of users registered in the app
  const {value,email}=req.query;
  try{
    const findUsers = await User.find({
      $and: [
        { email: { $regex: '^' + value, $options: 'i' } },
        { email: { $ne: email } }
      ]
    });
    if(findUsers) { //Users are registered
      console.log('Users exist ! ');
      return res.status(200).json(findUsers);
    }
    return res.status(404).json({message:'No users are registered other than you ! '}); //Only the current user is registered
  }
  catch(err) {
    console.log('Inside catch block of /listOfUsers',err);
    return res.status(500).json({message: " Server error "});
  }
});

app.post('/storeMsg', async (req, res) => {
  const { sender, reciever, recieverName, msg } = req.body;

  try {
    // Try to find existing conversation
    let y=0; //Short circuit variable to check which from the below line is executed first
    const existingChat = await Chatted.findOne({
      senderEmail: sender,
      recieverEmail: reciever
    }) || (y=1&&await Chatted.findOne({
      senderEmail: reciever,
      recieverEmail: sender
    }))

    if (existingChat) {
      const message = {
        sender: y === 1 ? reciever : sender,
        reciever: y === 1 ? sender : reciever,
        text: msg,
        timeStamp: new Date()
      };
  existingChat.messages.push(message);
  await existingChat.save();
  console.log("📨 Message added to existing chat.");
  y=0;
} else {
      // Create new chat
      const insertMsg = new Chatted({
        senderEmail: sender,
        recieverEmail: reciever,
        recieverUserName: recieverName,
        messages: [{sender:sender,reciever:reciever,text:msg,timeStamp:new Date}]
      });
      await insertMsg.save();
      console.log("🆕 New chat created and message saved.");
    }

    return res.status(200).json({ message: "Message stored successfully!" });
  } catch (err) {
    console.error("❌ Error storing message:", err);
    return res.status(500).json({ message: "Server error occurred!" });
  }
});

app.get('/retrieveMsgs',async(req,res)=>{ //Retriev list of msgs between the user and his chat which he clicks
  const {userEmail,otherEmail}=req.query;
  if(!userEmail||!otherEmail) { //User email and email of whos profile we clicked from chat history
    console.log('One of the email is missing, /retrieveMsgs ! ');
  }
  try{
    console.log('Inside try block of /retrieveMsgs ! ');
    const fetchMsgs=await Chatted.findOne({
      $or: [
        { senderEmail: sender },
        { recieverEmail: sender }
      ]
    });
    if(fetchMsgs&&fetchMsgs.length>0) { //Conversation found
      return res.status(200).json(fetchMsgs); //Return the conversation details
    } 
  }
  catch(err) {
    console.log('Inside catch block of /retrieveMsgs ! ');
  }
}); 

app.get('/chatHistory', async (req, res) => {
  const { sender } = req.query; // Logged-in user email

  try {
    console.log('Inside try block of /chatHistory !');

    const findChat = await Chatted.find({
      $or: [
        { senderEmail: sender },
        { recieverEmail: sender }
      ]
    });

    if (findChat.length === 0) {
      console.log('No chat history found for sender !');
      return res.status(404).json({ message: 'Chat history not found !' });
    }

    let counter=0;
    const names={}; //A names obj having reciever name and email
    // Get names of other users in each chat
    await Promise.all(
      findChat.map(async (chat) => {
        const otherEmail = chat.senderEmail === sender ? chat.recieverEmail : chat.senderEmail;
        const otherUser = await User.findOne({ email: otherEmail });
        return  names[counter++] = {
          email: otherEmail,
          name: otherUser ? otherUser.userName : "Unknown"
        };
      })
    );
    counter=0; //Reset counter 
    console.log('Found chat history!');
    return res.status(200).json({ findChat, names });
  } catch (err) {
    console.log('Inside catch block of /chatHistory ! ', err);
    return res.status(500).json({ message: 'Some error occurred !' });
  }
});

app.get('/chatWithUser',async(req,res)=>{ //Fetch all chats between user and the chat which he clicked on in the frontend
  const {sender}=req.query; //User (who is using the app right now) email
  try{
  console.log('Inside try block of /chatWithUser ! ');
  const findChat = await Chatted.find({
    $or: [
      { senderEmail: sender },
      { recieverEmail: sender }
    ]
  });
  if(findChat.length>0) { //Chats found 
    console.log('Chats found between user and the chat which he clicked on in the frontend ! ');
    return res.status(200).json(findChat);
  }
  //Chats not found
  console.log('Could not find chat between user and the chat he clicked on in the frontend ! ');
  return res.status(404).json({message:'Could not find chat ! '});
}
catch(err) {
  console.log('Inside catch block of /chatWithUser ! ');
  return res.status(500).json({message:'Some error occured ! '});
}
})

io.on('connection',(socket)=>{ //When a user joins / enters chat app
  console.log(`🔌 User connected: ${socket.id}`);
  socket.on('join_room',({userName,room})=>{ //When a user joins a room
    socket.join(room); //Adds the user to the correct chat room

    socket.data.userName=userName //Save the username in socket object so it can be accessed anywhere until the server is restarted
    socket.data.room=room;
    //Add the user to the online user list in that room
    if(!roomUsers[room]) { //If room does not exist , then initailzie an empty array ( meaning first user has joined it ) 
      roomUsers[room]={
        room:room,
        users:[]
      };
    }
    if(!roomUsers[room].users.includes(userName)) { //If the user is not already present
      roomUsers[room].users.push(userName); //Push the user into the online list for that room
    }    
    
    console.log(`📢 ${userName} joined room: ${room}`);

    socket.to(room).emit('user_joined',`${userName} joined the room`); //Notify other users in the room
    io.to(room).emit('online_list',roomUsers); //Send everyone in the room the list of users
  });

socket.on('send_message',({userName,room,message,timeStamp})=>{ //When a user sends message
  let cleanMsg=message; //Filter can break on emojis and special characters , so use this logic
  console.log("🔥 Deployed version running");
  
  try {
    const textOnly = message.replace(/[^\x00-\x7F]/g, ""); // remove emojis
    if (textOnly && filter.isProfane(textOnly)) { //If only text and contains bad words
      const match = filter.splitRegex.exec(textOnly); //Check if we can break the text cleanly 
      if (match && match[0]) { //If we can then go inside if block
        const cleaned = filter.clean(textOnly);
        cleanMsg = message.replace(textOnly, cleaned); // clean bad word, keep emoji
      } else { //If we cant break text cleanly , then use original message
        console.warn("⚠️ Could not clean message. Using original.");
      }
    }

  } catch (err) {
    console.warn("⚠️ Filter crashed. Using raw message.");
    cleanMsg = message;
  }
  console.log(`📩 Message in ${room} from ${userName}: ${cleanMsg}`); 
  io.to(room).emit('receive_message',{userName,message:cleanMsg,timeStamp}); //Send the message and timestamp to everyone
});

  socket.on('disconnect',()=>{ //When a frontned socket for user disconnects
    const userName=socket.data.userName; //Retrieve the userName and room from sokcet object
    const room=socket.data.room;

    if(userName&&room&&roomUsers[room]) {
      roomUsers[room].users = roomUsers[room].users.filter(name=>name!==userName); //Remove the user who disconnected or left
      io.to(room).emit('online_list',roomUsers); //Notify everyone in the room about the updated list
      socket.to(room).emit('user_left',`${userName} left the room`);
    }
});

socket.on('typing',({userName,room})=>{ //Someone is typing
  socket.to(room).emit('typing_list',`${userName} is typing...`);
});

socket.on('join_private_chat',({email})=>{ //Each user joins their own private room
  if(userSockets[email]) { //Preventing duplicate socket connections
    const oldSocketId=userSockets[email];
    const oldSocket=io.sockets.sockets.get(oldSocketId);
    if(oldSocket) {
      oldSocket.disconnect(true);
    }
  }
  userSockets[email]=socket.id;
  socket.join(email);
  console.log(`📥 User with email ${email} joined their private room`);
})

socket.on('private_msg',({sender,recipient,message})=>{ //In frontend user sent a message / chatted to someone
  console.log(`Message ${message} sent from ${sender} to ${recipient}`);
  io.to(recipient).emit('recieve_private_msg',{ //Send the message to the recipient's socket
    sender,
    recipient,
    message,
    timeStamp:new Date()
  });
  io.to(sender).emit('recieve_private_msg', {
    sender,
    recipient,
    message,
    timeStamp:new Date()}); //Send the messgage to sender
});

});

const PORT=5000;
server.listen((PORT),()=>{
  console.log(`🚀 WebSocket Server running on port ${PORT}`);
})