const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  senderEmail: { type: String, required: true },
  recieverEmail: { type: String, required: true },
  recieverUserName: { type: String, required: true },
  messages: [
    {
      sender : { type: String, required: true }, 
      reciever: { type: String, required: true },
      text: { type: String, required: true },
      timeStamp: { type: Date, default: Date.now } // auto adds time when message is saved
    }
  ]
});

module.exports = mongoose.model("Chatted", userSchema);
