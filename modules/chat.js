var manager = require('../manager');

function handle(socket) {
    socket.on('chatMsg', function(msg) {
        socket.broadcast.to(msg.room).emit('chatMsg', msg);
    });

    socket.on('broadcastMsg', function(msg) {
        socket.broadcast.emit('chatMsg', msg);
    });

    socket.on('createRoom', function(sentRoom) {
        manager.createRoom(sentRoom, function(err, room) {
            if(err) {
                socket.emit('message', { text : ['Failed to create the room'] });
            } else {
                socket.emit('message', { text : ['Room successfully created'] });
            }
        });
    });

    socket.on('follow', function(sentRoom) {
        if(sentRoom.password === undefined) { sentRoom.password = '' }

        manager.getUserById(socket.id, function(err, user) {
            if(err || user === null) {
                socket.emit('message', { text : ['Failed to follow room'] });
            } else {
                manager.authUserToRoom(user, sentRoom.roomName, sentRoom.password, function(err, room) {
                    if(err || room === null) {
                        socket.emit('message', { text : ['Failed to follow room'] });
                    } else {
                        manager.addRoomToUser(user.userName, room.roomName, function(err) {
                            if(err) {
                                socket.emit('message', { text : ['Failed to follow the room'] });
                            } else {
                                if(sentRoom.entered) { room.entered = true }

                                if(socket.rooms.indexOf(room.roomName) < 0) {
                                    socket.broadcast.to(room.roomName).emit('chatMsg', {
                                        text : user.userName + ' is following ' + room.roomName,
                                        room : room.roomName
                                    });
                                }

                                socket.join(room.roomName);
                                socket.emit('follow', room);
                            }
                        });
                    }
                });
            }
        });
    });

    socket.on('unfollow', function(room) {
        if(socket.rooms.indexOf(room.roomName) > -1) {
            manager.getUserById(socket.id, function(err, user) {
                if(err || user === null) {
                    socket.emit('message', { text : ['Failed to unfollow room'] });
                } else {
                    manager.removeRoomFromUser(user.userName, room.roomName, function(err, user) {
                        if(err || user === null) {
                            socket.emit('message', { text : ['Failed to unfollow room'] });
                        } else {
                            socket.broadcast.to(room.roomName).emit('chatMsg', {
                                text : user.userName + ' left ' + room.roomName,
                                room : room.roomName
                            });
                            socket.leave(room.roomName);
                            socket.emit('unfollow', room);
                        }
                    });
                }
            });
        } else {
            socket.emit('message', { text : ['You are not following ' + room.roomName] });
        }
    });

    // Shows all available rooms
    socket.on('listRooms', function() {
        manager.getUserById(socket.id, function(err, user) {
            if(err || user === null) {
                console.log('Failed to get user by id', err);
            } else {
                manager.getAllRooms(user, function(roomErr, rooms) {
                    if(roomErr) {
                        console.log('Failed to get all room names', roomErr);
                    } else {
                        if(rooms.length > 0) {
                            var roomsString = '';

                            for(var i = 0; i < rooms.length; i++) {
                                roomsString += rooms[i].roomName + '\t';
                            }

                            socket.emit('message', { text : [roomsString] });
                        }
                    }
                });
            }
        });
    });

    socket.on('listUsers', function() {
        manager.getUserById(socket.id, function(err, user) {
            if(err || user === null) {
                console.log('Failed to get user by id', err);
            } else {
                manager.getAllUsers(user, function(userErr, users) {
                    if(users.length > 0) {
                        var usersString = '';

                        for(var i = 0; i < users.length; i++) {
                            usersString += users[i].userName + '\t';
                        }

                        socket.emit('message', { text : [usersString] });
                    }
                });
            }
        });
    });

    socket.on('myRooms', function() {
        var roomsString = socket.rooms.slice(1).sort().join('\t');

        socket.emit('message', { text : [roomsString] });
    });
}

exports.handle = handle;