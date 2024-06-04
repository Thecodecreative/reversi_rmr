/****** */
/* Setup the static file server */

let static = require('node-static');

/* Set up the http server library */
let http = require('http');

/* Assume that we are running on Heroku*/
let port = process.env.PORT;
let directory = __dirname + '/public';

/* if we are not running on Heroku, the n we need to adjust our port and directory */
if ((typeof port == 'undefined') || (port === null)) {
  port = 8080;
  directory = './public';
}

/* Set up our static file web server to deliver files from the filesystem */
let file = new static.Server(directory);

let app = http.createServer(
  function (request, response) {
    request.addListener('end',
      function () {
        file.serve(request, response);
      }
    ).resume();

  }
).listen(port);

console.log('The server is running');

//Set up registry of player information and their socket io 

let players = [];

/* Set up the web socket server */

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {
  /* output a log mesage on like server and send it to the clients */

  function serverLog(...messages) {
    io.emit('log', ['**** Message from the server:\n']);
    messages.forEach((item) => {
      io.emit('log', ['****\t' + item]);
      console.log(item);
    });
  }

  serverLog('a page connected to the server: ' + socket.id);


  /* join room command handler */
  /* expected payload:
  {
      'room': the room to be joined,
      'username': the name of the user joining the room
  }
  */

  /*join_room response:
    {
      'result' : 'success',
      'room': room that was joined,
      'username': the user that joined the room,
      'count' : the number of users in the chat room
      'socket_id: the socket of the user that just joined the room
    }
  or
    {
      'result' : 'fail',
      'message': the reason for failure
    }
  */


  socket.on('join_room', (payload) => {
    serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    let room = payload.room;
    let username = payload.username;
    if ((typeof room == 'undefined') || (room === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid room to join';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid username to join the chat room';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command*/
    socket.join(room);

    /* Make sure the client was put in the room */
    io.in(room).fetchSockets().then((sockets) => {
      /*Socket didn't join the room */

      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
        response = {};
        response.result = 'fail';
        response.message = 'Server internal error joining chat room';
        socket.emit('join_room_response', response);
        serverLog('join_room command failed', JSON.stringify(response));
      }

      /*Socket did join the room */
      else {
        players[socket.id] = {
          username: username,
          room: room
        }

        //Announce to everyon ethat is in the room who else is in the room

        for (const member of sockets) {
          let room = players[member.id].room;
          response = {
            result: 'success',
            socket_id: member.id,
            room: players[member.id].room,
            username: players[member.id].username,
            count: sockets.length
          }
          /* Tell everyone that a new user has joined the chat room */
          io.of('/').to(room).emit('join_room_response', response);
          serverLog('join_room succeeded', JSON.stringify(response));
        }
      }

      if (room !== "Lobby") {
        send_game_update(socket, room, 'initial update');
      }

    });
  });


  socket.on('invite', (payload) => {
    serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to invite to play'
      }
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }

    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'the user that was invited is not in a room '
      }

      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }

    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was invited does not have a name registered'
      }

      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command*/
    socket.join(room);

    /* Make sure the invited player is present */
    io.in(room).allSockets().then((sockets) => {
      /*Invitee isn't in the room  */

      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was invited is no longer in the room'
        }
        socket.emit('invite_response', response);
        serverLog('invite command failed', JSON.stringify(response));
      }

      /*Invitee is in the room */
      else {
        response = {
          result: 'success',
          socket_id: requested_user
        }
        socket.emit("invite_response", response);
        response = {
          result: 'success',
          socket_id: socket.id
        }
        socket.to(requested_user).emit("invited", response);
        serverLog('invite command succeeded', JSON.stringify(response));
      }


    });
  });


  socket.on('uninvite', (payload) => {
    serverLog('Server received a command', '\'uninvite\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to uninvite'
      }
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }

    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'the user that was uninvited is not in a room '
      }

      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }

    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was uninvited does not have a name registered'
      }

      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command*/
    socket.join(room);

    /* Make sure the uninvited player is present */
    io.in(room).allSockets().then((sockets) => {
      /*Uninvitee isn't in the room  */

      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was uninvited is no longer in the room'
        }
        socket.emit('uninvited', response);
        serverLog('uninvite command failed', JSON.stringify(response));
      }

      /*UnInvitee is in the room */
      else {
        response = {
          result: 'success',
          socket_id: requested_user
        }
        socket.emit("uninvited", response);
        response = {
          result: 'success',
          socket_id: socket.id
        }
        socket.to(requested_user).emit("uninvited", response);
        serverLog('uninvite command succeeded', JSON.stringify(response));
      }
    });
  });


  socket.on('game_start', (payload) => {
    serverLog('Server received a command', '\'uninvite\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to engage in play'
      }
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }

    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'the user that was engaged to play is not in a room '
      }

      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }

    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was engaged to play does not have a name registered'
      }

      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command*/
    socket.join(room);

    /* Make sure the player to engage is present */
    io.in(room).allSockets().then((sockets) => {
      /*Engaged Player isn't in the room  */

      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was engaged to play is no longer in the room'
        }
        socket.emit('game_start_response', response);
        serverLog('game_start command failed', JSON.stringify(response));
      }

      /*Engaged Player is in the room */
      else {
        let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
        response = {
          result: 'success',
          game_id: game_id,
          socket_id: requested_user
        }
        socket.emit("game_start_response", response);
        socket.to(requested_user).emit("game_start_response", response);
        serverLog('game_start command succeeded', JSON.stringify(response));
        /* if (room !== "Lobby") {
          send_game_update(socket, room, 'initial update');
        }*/
      }
    });
  });


  socket.on('disconnect', () => {
    serverLog('a page disconnected from the server: ' + socket.id);
    if ((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
      let payload = {
        username: players[socket.id].username,
        room: players[socket.id].room,
        count: Object.keys(players).length = 1,
        socket_id: socket.id
      };

      let room = players[socket.id].room;
      delete players[socket.id];

      // tell everyone who left the room 

      io.of("/").to(room).emit('player_disconnected', payload);
      serverLog('player_disconnected succeeded', JSON.stringify(payload));
    }
  });

  /* send chat message command handler */
  /* expected payload:
  {
      'room': the room to which the message should be sent,
      'username': the name of the sender,
      'message': the essage to broadcast
  }
  */

  /*send chat message response:
    {
      'result' : 'success',
      'username': the user that sent the message,
      'message' : the nmessage that was sent 
    }
  or
    {
      'result' : 'fail',
      'message': the reason for failure
    }
  */


  socket.on('send_chat_message', (payload) => {
    serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    let room = payload.room;
    let username = payload.username;
    let message = payload.message;
    if ((typeof room == 'undefined') || (room === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid room to message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_messagecommand failed', JSON.stringify(response));
      return;
    }

    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid username as a message source';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    if ((typeof message == 'undefined') || (message === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }


    /*Handle the command*/
    let response = {};
    response.result = 'success';
    response.username = username;
    response.room = room;
    response.message = message;

    /* Tell everyone in the room what the message is */
    io.of('/').to(room).emit('play_token', response);
    response.message = 'play_token_response';
    serverLog('send_chat_message succeeded', JSON.stringify(response));
  });

  socket.on('play_token', (payload) => {
    serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));

    /*check that the data coming from the client is good */

    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid payload';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let player = players[socket.id];
    if ((typeof player == 'undefined') || (player === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'Play token came from unregistered player';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }


    let username = player.username;
    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'play_token command did not come from a registered username';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }


    let game_id = player.room;
    if ((typeof game_id  == 'undefined') || (game_id  === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'There was no valid game associated with the play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let row = player.row;
    if ((typeof row  == 'undefined') || (row === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'There was no valid row associated with the play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let column = player.column;
    if ((typeof column == 'undefined') || (column === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'There was no valid column associated with the play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let color = player.color;
    if ((typeof color == 'undefined') || (color === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'There was no valid color associated with the play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }


    let game = games[game_id];
    if ((typeof game == 'undefined') || (game === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'There was no valid game associated with the play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let response ={
      result: 'success'
    }
    socket.emit('play_token_response', response);

    /*Execute the move */
    if (color === 'white') {
      game.board[row][column] = 'w';
      game.whose_turn = 'black'
    }
    else if (color === 'black') {
      game.board[row][column] = 'b';
      game.whose_turn = 'white'
    }

    send_game_update(socket, game_id, 'played a token')

  });



});

/******* */
/* Code related to game state */

let games = [];

function create_new_game() {
  let new_game = {};
  new_game.player_white = {};
  new_game.player_white.socket = " ";
  new_game.player_white.username = " ";
  new_game.player_black = {};
  new_game.player_black.socket = " ";
  new_game.player_black.username = " ";

  var d = new Date();
  new_game.Last_move_time = d.getTime();

  new_game.whose_turn = 'white';

  new_game.board = [
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', 'w', 'b', ' ', ' ', ' '],
    [' ', ' ', ' ', 'b', 'w', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
  ];
  return new_game;

}

function send_game_update(socket, game_id, message) {
  /* Make sure that only 2 people are in the room */
  /*Assign this socket a color */
  /* Send game update */
  /*Check if the game is over */

  /* Check to see if a game with a game_id exists */
  if ((typeof games[game_id] == 'undefined') || (games[game_id] === null)) {
    console.log(" No game exists with game_id" + game_id + " . Making a new game for " + socket.id);
    games[game_id] = create_new_game();
  }

  /* Make sure that only 2 people are in the room */
  /*Assign this socket a color */
  io.of("/").to(game_id).allSockets().then((sockets) => {

    const iterator = sockets[Symbol.iterator]();
    if (sockets.size >= 1) {
      let first = iterator.next().value;
      if ((games[game_id].player_white.socket != first) && (games[game_id].player_black.socket != first)) {
        /*Player does not have a color */
        if (games[game_id].player_white.socket === " ") {
          /*This player should be white */
          console.log("White is assigned to: " + first);
          games[game_id].player_white.socket = first;
          games[game_id].player_white.username = players[first].username;
        }
        else if (games[game_id].player_black.socket === " ") {
          /*This player should be black */
          console.log("Black is assigned to: " + first);
          games[game_id].player_black.socket = first;
          games[game_id].player_black.username = players[first].username;
        }
        else {
          /*This player should be kicked out */
          console.log("Kicking " + first + "out of the game: " + game_id);
          io.in(first).socketsLeave([game_id]);
        }
      }
    }

    if (sockets.size >= 2) {
      let second = iterator.next().value;
      if ((games[game_id].player_white.socket != second) && (games[game_id].player_black.socket != second)) {
        /*Player does not have a color */
        if (games[game_id].player_white.socket === " ") {
          /*This player should be white */
          console.log("White is assigned to: " + second);
          games[game_id].player_white.socket = second;
          games[game_id].player_white.username = players[second].username;
        }
        else if (games[game_id].player_black.socket === " ") {
          /*This player should be black */
          console.log("Black is assigned to: " + second);
          games[game_id].player_black.socket = second;
          games[game_id].player_black.username = players[second].username;
        }
        else {
          /*This player should be kicked out */
          console.log("Kicking " + second + "out of the game: " + game_id);
          io.in(second).socketsLeave([game_id]);
        }
      }
    }


    /* Send game update */
    let payload = {
      result: 'success',
      game_id: game_id,
      game: games[game_id],
      message: message
    }

    io.of("/").to(game_id).emit('game_update', payload)
  })


}
