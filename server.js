const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const cors=require('cors');
const Filter=require('bad-words');
const filter=new Filter();

const app=express();
const server=http.createServer(app);
const roomUsers={}; //Object of arrays to store all the online users room wise

const io=new Server(server,{
  cors:{
    origin:'https://chatmango.netlify.app',
    methods: ['GET', 'POST'],
  },
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
});

const PORT=5000;
server.listen((PORT),()=>{
  console.log(`🚀 WebSocket Server running on port ${PORT}`);
})