<!DOCTYPE html>
<html>
<head>
  <title>TalkToSmile</title>
  <style>
    body{
      background:#020617;
      color:white;
      text-align:center;
      font-family:sans-serif;
    }
    button{
      margin:5px;
      padding:10px;
      border-radius:10px;
      border:none;
      background:#0ea5e9;
      color:white;
    }
    #chatBox{
      height:200px;
      border:1px solid #0ea5e9;
      margin:10px;
      overflow-y:auto;
      padding:10px;
    }
    input{
      padding:10px;
      width:80%;
      border-radius:10px;
      border:none;
    }
  </style>
</head>

<body>

<h1>TalkToSmile 😎</h1>

<p id="status">Status: Idle</p>

<button id="startBtn">Start Chat</button>
<button id="disconnectBtn">Disconnect</button>

<br><br>

<div id="chatBox"></div>

<input id="msgInput" placeholder="Type message...">
<br>
<button id="sendBtn">Send</button>

<!-- IMPORTANT -->
<script type="module" src="script.js"></script>

</body>
</html>
