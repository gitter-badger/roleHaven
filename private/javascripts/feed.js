'use strict';

//
// const and let support is still kind of shaky on client side, thus the
// usage of var

var mainFeed;
var marker;
var inputText;
var inputStart;
var modeField;
var spacer;

var socket;
// Timeout for print of a character (milliseconds)
var charTimeout;
// Timeout between print of rows (milliseconds)
var rowTimeout;
// Queue of all the message objects that will be handled and printed
var messageQueue;
// Characters left to print during one call to printText().
// It has to be zero before another group of messages can be printed.
var charsInProgress;

var tracking = true;

// Queue of all the sounds that will be handled and played
var soundQueue = [];
var audioCtx;
var oscillator;
var gainNode;
var soundTimeout = 0;

var cmdHistory;
var previousCommandPointer;
var currentUser;
var currentAccessLevel;
var oldPosition;
var currentPosition;

var morseCodes = {
    'a' : '.-',
    'b' : '-...',
    'c' : '-.-.',
    'd' : '-..',
    'e' : '.',
    'f' : '..-.',
    'g' : '--.',
    'h' : '....',
    'i' : '..',
    'j' : '.---',
    'k' : '-.-',
    'l' : '.-..',
    'm' : '--',
    'n' : '-.',
    'o' : '---',
    'p' : '.--.',
    'q' : '--.-',
    'r' : '.-.',
    's' : '...',
    't' : '-',
    'u' : '..-',
    'v' : '...-',
    'w' : '.--',
    'x' : '-..-',
    'y' : '-.--',
    'z' : '--..',
    '1' : '.----',
    '2' : '..---',
    '3' : '...--',
    '4' : '....-',
    '5' : '.....',
    '6' : '-....',
    '7' : '--...',
    '8' : '---..',
    '9' : '----.',
    '0' : '-----',
    // Symbolizes space betwen words
    '#' : '#'
};
var logo = {
    speed : 0.5,
    extraClass : 'logo',
    text : [
        // '                          ####',
        // '                ####    #########    ####',
        // '               ###########################',
        // '              #############################',
        // '            #######        ##   #  ##########',
        // '      ##########           ##    #  ###  ##########',
        // '     #########             #########   #   #########',
        // '       #####               ##     ########   #####',
        // '     #####                 ##     ##     ##########',
        // '     ####                  ##      ##     #   ######',
        // ' #######                   ##########     ##    ########',
        // '########                   ##       ########     ########',
        // ' ######      Organica      ##       #      #############',
        // '   ####     Oracle         ##       #      ##     ####',
        // '   ####     Operations     ##       #      ##    #####',
        // '   ####      Center        ##       #      ###########',
        // '########      Razor1911    ##       #########    ########',
        // '########       Edition     ##########      #    #########',
        // ' ########                  ##      ##     ## ###########',
        // '     #####                 ##      ##     ### #####',
        // '       #####               ##     ########   #####',
        // '      #######              ##########   #  ########',
        // '     ###########           ##    ##    # ###########',
        // '      #############        ##    #   #############',
        // '            ################################',
        // '              ############################',
        // '              #######  ##########  #######',
        // '                ###      ######      ###',
        // '                          ####',
        ' ',
        '[Developer\'s note:] NOTE! THIS IS A DEV SERVER!',
        'EVERYTHING MAY BE DELETED AT ANY TIME. THERE WILL BE BUGS!'
    ]
};

var mapHelper = {
    leftLong : 17.7992307,
    rightLong : 18.1828902,
    topLat : 59.4463469,
    bottomLat : 59.2818812,
    xGridsMax : 23,
    yGridsMax : 36,
    xSize : 0,
    ySize : 0,
    xGrids : {},
    yGrids : {}
};

var commandFailText = { text : ['command not found'] };
var platformCmds = {
    setLocalVal : function(name, item) {
        localStorage.setItem(name, item);
    },
    getLocalVal : function(name) {
        return localStorage.getItem(name);
    },
    removeLocalVal : function(name) {
        localStorage.removeItem(name);
    },
    isTextAllowed : function(text) {
        return /^[a-zA-Z0-9]+$/g.test(text);
    },
    queueMessage : function(message) {
        messageQueue.push(message);
    },
    resetAllLocalVals : function() {
        localStorage.removeItem('cmdHistory');
        cmdHistory = [];
        previousCommandPointer = 0;
        localStorage.removeItem('user');
        currentUser = null;
        localStorage.removeItem('room');
        localStorage.setItem('mode', 'normalmode');
        setInputStart('RAZCMD');
    },
    getCommands : function() {
        var keys = Object.keys(validCmds).sort();
        var commands = [''];

        for(var i = 0; i < keys.length; i++) {
            var commandAccessLevel = validCmds[keys[i]].accessLevel;

            if(isNaN(commandAccessLevel) ||
               currentAccessLevel >= commandAccessLevel) {
                var msg = '';

                msg += keys[i];

                if(i !== keys.length - 1) {
                    msg += ' | ';
                }

                commands[0] += msg;
            }
        }

        return commands;
    }
};

var cmdHelper = {
    maxSteps : 0,
    onStep : 0,
    command : null,
    keyboardBlocked : false,
    data : null
};
// Used by isScreenOff() to force reconnect when phone screen is off
// for a longer period of time
var lastInterval = (new Date()).getTime();

// Object containing all running intervals
var interval = {
    tracking : null,
    printText : null,
    isScreenOff : null
};
var validCmds = {
    help : {
        func : function() {
            platformCmds.queueMessage({
                text : [
                    'Add -help after a command (with whitespace in between) ' +
                    'to get instructions on how to use it'
                ]
            });
            platformCmds.queueMessage({
                text : platformCmds.getCommands()
            });
        },
        help : ['Shows a list of available commands']
    },
    clear : {
        func : function() {
            while(mainFeed.childNodes.length > 1) {
                mainFeed.removeChild(mainFeed.lastChild);
            }
        },
        help : ['Clears the terminal view'],
        clearAfterUse : true
    },
    whoami : {
        func : function() {
            platformCmds.queueMessage({ text : [currentUser] });
        },
        help : ['Shows the current user']
    },
    msg : {
        func : function(phrases) {
            if(phrases && phrases.length > 0) {
                var writtenMsg = phrases.join(' ');

                socket.emit('chatMsg', {
                    message : {
                        text : [writtenMsg],
                        user : currentUser
                    },
                    roomName : platformCmds.getLocalVal('room')
                });
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to write the message!']
                });
            }
        },
        help : [
            'Sends a message to your current room',
            'The room you are in is written out to the left of the marker'
        ],
        instructions : [
            ' Usage:',
            '  msg *message*',
            ' Example:',
            '  msg Hello!'
        ],
        clearAfterUse : true
    },
    broadcast : {
        func : function(phrases) {
            if(phrases && phrases.length > 0) {
                var writtenMsg = phrases.join(' ');

                socket.emit('broadcastMsg', {
                    message : {
                        text : [writtenMsg],
                        user : currentUser
                    },
                    roomName : 'ALL'
                });
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to write the message!']
                });
            }
        },
        help : [
            'Sends a message to all users in all rooms',
            'It will prepend the message with "[ALL]"'
        ],
        instructions : [
            ' Usage:',
            '  broadcast *message*',
            ' Example:',
            '  broadcast Hello!'
        ],
        clearAfterUse : true,
        accessLevel : 7
    },
    enterroom : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var room = {};
                var roomName = phrases[0];
                var password = '';

                if(phrases.length > 1) {
                    password = phrases[1];
                }

                if(roomName) {
                    room.roomName = roomName;
                    room.password = password;
                    // Flag that will be used in .on function locally to
                    // show user they have entered
                    room.entered = true;
                    socket.emit('follow', room);
                }
            } else {
                platformCmds.queueMessage({
                    text : ['You have to specify which room to follow']
                });
            }
        },
        help : [
            'Enters a chat room.',
            'The room has to exist for you to enter it'
        ],
        instructions : [
            ' Usage:',
            '  enterroom *room name* *optional password*',
            ' Example:',
            '  enterroom sector5 banana'
        ]
    },
    exitroom : {
        func : function() {
            if(platformCmds.getLocalVal('room') !== 'public') {
                var room = {};

                room.roomName = platformCmds.getLocalVal('room');
                // Flag that will be used in .on function locally to
                // show user they have exited
                room.exited = true;
                socket.emit('unfollow', room);
            }
        },
        help : ['Leaves the chat room you are in, if you are in one.']
    },
    follow : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var room = {};
                room.roomName = phrases[0];
                room.password = phrases[1];

                socket.emit('follow', room);
            } else {
                platformCmds.queueMessage({
                    text : [
                        'You have to specify which room to follow and a' +
                        'password (if it is protected)'
                    ]
                });
            }
        },
        help : [
            'Follows a room and shows you all messages posted in it.',
            'You will get the messages from this room even if it isn\'t' +
            'your currently selected one'
        ],
        instructions : [
            ' Usage:',
            '  follow *room name* *optional password*',
            ' Example:',
            '  follow room1 banana'
        ]
    },
    unfollow : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var room = {};
                var roomName = phrases[0];

                if(roomName === platformCmds.getLocalVal('room')) {
                    room.exited = true;
                }

                room.roomName = roomName;

                socket.emit('unfollow', room);
            } else {
                platformCmds.queueMessage({
                    text : ['You have to specify which room to unfollow']
                });
            }
        },
        help : ['Stops following a room.'],
        instructions : [
            ' Usage:',
            '  unfollow *room name*',
            ' Example:',
            '  unfollow roomname'
        ]
    },
    listrooms : {
        func : function() {
            socket.emit('listRooms');
        },
        help : [
            'Shows all the rooms you are following.',
            'public is the room that all users automatically join.'
        ]
    },
    chatmode : {
        func : function() {
            platformCmds.setLocalVal('mode', 'chatmode');
            setMode('[CHAT]');
            platformCmds.queueMessage({
                text : [
                    'Chat mode activated',
                    'Prepend commands with "-", e.g. "-normalmode"'
                ]
            });
        },
        help : [
            'Sets mode to chat',
            'Everything written will be interpreted as chat messages',
            'You will not need to use "msg" command to write messages',
            'Use "-normalmode" to exit out of chat mode'
        ],
        instructions : [
            'If you want to use a command in chatmode it has to be ' +
            'prepended with "-"',
            'Example: ',
            ' -normalmode'
        ]
    },
    normalmode : {
        func : function() {
            platformCmds.setLocalVal('mode', 'normalmode');
            setMode('');
            platformCmds.queueMessage({ text : ['Normal mode activated'] });
        },
        help : [
            'Sets mode to normal',
            'This is the default mode',
            'You have to use "msg" command to write messages'
        ]
    },
    register : {
        func : function(phrases) {
            if(platformCmds.getLocalVal('user') === null) {
                var errorMsg = {
                    text : [
                        'Name has to be 3 to 6 characters long',
                        'The name can only contain letters and numbers ' +
                        '(a-z, 0-9)',
                        'Password has to be 4 to 10 characters',
                        'Don\'t use whitespace in your name or password!',
                        'e.g. register myname apple1'
                    ]
                };

                if(phrases.length > 1) {
                    var user = {};
                    var userName = phrases[0];
                    var password = phrases[1];

                    if(userName.length >= 3 && userName.length <= 6 &&
                       password.length >= 4 && password.length <= 10 &&
                       platformCmds.isTextAllowed(userName)) {
                        user.userName = userName;
                        // Check for empty!
                        user.password = password;
                        socket.emit('register', user);
                    } else {
                        platformCmds.queueMessage(errorMsg);
                    }
                } else {
                    platformCmds.queueMessage(errorMsg);
                }
            } else {
                platformCmds.queueMessage({
                    text : [
                        'You have already registered a user',
                        platformCmds.getLocalVal('user') +
                        ' is registered to this device'
                    ]
                });
            }
        },
        help : [
            'Registers your user name on the server and connects it ' +
            'to your device',
            'This user name will be your identity in the system',
            'The name can only contain letters and numbers (a-z, 0-9)',
            'Don\'t use whitespaces in your name or password!'
        ],
        instructions : [
            ' Usage:',
            '  register *user name* *password*',
            ' Example:',
            '  register myname secure1'
        ],
        clearAfterUse : true
    },
    listusers : {
        func : function() {
            socket.emit('listUsers');
        }
    },
    createroom : {
        func : function(phrases) {
            var errorMsg = {
                text : [
                    'Failed to create room.',
                    'Room name has to be 1 to 6 characters long',
                    'The room name can only contain letters and numbers ' +
                    '(a-z, 0-9)',
                    'e.g. createroom myroom'
                ]
            };

            if(phrases.length > 0) {
                var roomName = phrases[0];
                var password = phrases[1];

                if(roomName.length > 0 && roomName.length < 7 &&
                   platformCmds.isTextAllowed(roomName)) {
                    var room = {};

                    room.roomName = roomName;
                    room.password = password;

                    socket.emit('createRoom', room);
                } else {
                    platformCmds.queueMessage(errorMsg);
                }
            } else {
                platformCmds.queueMessage(errorMsg);
            }
        },
        help : [
            'Creates a chat room',
            'The rooms name has to be 1 to 6 characters long',
            'The password is optional, but if set it has to be 4 to 10 ' +
            'characters',
            'The name can only contain letters and numbers (a-z, 0-9)'
        ],
        instructions : [
            ' Usage:',
            '  createroom *room name* *optional password*',
            ' Example:',
            '  createroom myroom banana'
        ],
        accessLevel : 3
    },
    myrooms : {
        func : function() {
            socket.emit('myRooms');
        },
        help : ['Shows a list of all rooms you are following']
    },
    login : {
        func : function(phrases) {
            if(phrases.length > 1) {
                var user = {};
                user.userName = phrases[0];
                user.password = phrases[1];

                socket.emit('login', user);
            }
        },
        help : ['Logs in as a user on this device'],
        instructions : [
            ' Usage:',
            '  login *user name* *password',
            ' Example:',
            '  login user11 banana'
        ],
        clearAfterUse : true
    },
    time : {
        func : function() {
            socket.emit('time');
        },
        help : ['Shows the current time']
    },
    locate : {
        func : function(phrases) {
            if(!tracking) {
                platformCmds.queueMessage({
                    text : [
                        'Tracking not available',
                        'You are not connected to the satellites'
                    ]
                });
            } else if(phrases.length > 0) {
                var userName = phrases[0];

                socket.emit('locate', userName);
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to specify user!']
                });
            }
        },
        help : [
            'Shows the last known location of the user',
            '* is a shortcut for all users',
            'You need to be connected to the satellites to access this command'
        ],
        instructions : [
            ' Usage:',
            '  locate *user name OR "*"*',
            ' Example:',
            '  locate user1',
            '  locate *'
        ]
    },
    decryptmodule : {
        func : function() {
            //platformCmds.queueMessage({
            //    text : [
            //        '   ####',
            //        '###############',
            //        ' #####  #########                                     ' +
            //        '      ####',
            //        '  ####     #######  ########     ###########    ####  ' +
            //        '   ###########',
            //        '  ####    ######      #######   ####   #####  ########' +
            //        '    ####   #####',
            //        '  ####  ###         ####  ####        ####  ###    ###' +
            //        '### ####   #####',
            //        '  #########        ####    ####     ####   #####     #' +
            //        '#############',
            //        '  #### ######     ####     #####  ####     #######   #' +
            //        '##  ########',
            //        '  ####   ######  ##### #### #### ############  #######' +
            //        '    ####   ###',
            //        ' ######    #############    ################     ###  ' +
            //        '    ####    #####',
            //        '########     ########         ###                     ' +
            //        '   ######      #####   ##',
            //        '               ###########        ##                  ' +
            //        '                  ###### ',
            //        '                    ###############    Razor1911',
            //        '                         #####   demos - warez - honey',
            //        ' '
            //    ],
            //    extraClass : 'logo',
            //    speed : 10
            //});
            platformCmds.queueMessage({
                text : [
                    //'Razor1911 proudly presents:',
                    //'Entity Hacking Access! (EHA)',
                    //'AAAB3NzaC1yc2EAAAADAQABAAABAQDHS//2a/B',
                    //'D6Rsc8OO/6wFUVDdpdAItvSCLCrc/dcJE/ybEV',
                    //'w3OtlVFnfNkOVAvhObuWO/6wFUVDdkr2YTaDEt',
                    //'i5mxEFD1zslvhObuWr6QKLvfZVczAxPFKLvfZV',
                    //'dK2zXrxGOmOFllxiCbpGOmOFlcJyiCbp0mA4ca',
                    //'MFvEEiKXrxGlxiCbp0miONA3EscgY/yujOMJHa',
                    //'Q1uy6yEZOmOFl/yujOMJHa881DVwWl6lsjHvSi',
                    //'wDDVwWl6el88/x1j5C+k/atg1lcvcz7Tdtve4q',
                    //'VTVz0HIhxv595Xqw2qrv6GrdX/FrhObuWr6QKL',
                    //' ',
                    //'Please wait.......',
                    //'Command interception.........ACTIVATED',
                    //'Oracle defense systems........DISABLED',
                    //'Overriding locks..................DONE',
                    //'Connecting to entity database.....DONE',
                    //' ',
                    'You can cancel out of the command by typing "exit" ' +
                    'or "abort"'
                ],
                speed : 10
            });
            setInputStart('Enter encryption key');
            socket.emit('entities');
        },
        steps : [
            function(phrase, socket) {
                socket.emit('verifyKey', phrase);
                platformCmds.queueMessage({
                    text : [
                        'Verifying key. Please wait...'
                    ]
                });
                cmdHelper.keyboardBlocked = true;
                setInputStart('Verifying...');
            },
            function(data, socket) {
                if(data.keyData !== null) {
                    if(!data.keyData.used) {
                        platformCmds.queueMessage({
                            text : ['Key has been verified. Proceeding']
                        });
                        cmdHelper.onStep++;
                        cmdHelper.data = data;
                        validCmds[cmdHelper.command].steps[cmdHelper.onStep](
                            socket
                        );
                    } else {
                        platformCmds.queueMessage({
                            text : ['Key has already been used. Aborting']
                        });
                        resetCommand(true);
                    }
                } else {
                    platformCmds.queueMessage({
                        text : ['The key is invalid. Aborting']
                    });
                    resetCommand(true);
                }
            },
            function() {
                setInputStart('Enter entity name');
                cmdHelper.keyboardBlocked = false;
                cmdHelper.onStep++;
            },
            function(phrase, socket) {
                var data = cmdHelper.data;

                data.entityName = phrase;
                data.userName = currentUser;
                socket.emit('unlockEntity', data);
                platformCmds.queueMessage({
                    text : [
                        'Unlocking entity. Please wait...'
                    ]
                });
                cmdHelper.keyboardBlocked = true;
            },
            function(entity) {
                if(entity !== null) {
                    platformCmds.queueMessage({
                        text : [
                            'Confirmed. Encryption key has been used on ' +
                            'the entity',
                            entity.entityName + ' now has ' +
                            (entity.keys.length + 1) + ' unlocks',
                            'Thank you for using EHA'
                        ]
                    });
                } else {
                    platformCmds.queueMessage({
                        text : [
                            'Failed',
                            'Encryption key could not be used on entity.',
                            'Aborting'
                        ]
                    });
                    resetCommand(true);
                }
            }
        ],
        help : [
            'ERROR. UNAUTHORIZED COMMAND...AUTHORIZATION OVERRIDDEN. ' +
            'PRINTING INSTRUCTIONS',
            'Allows you to input an encryption key and use it to unlock ' +
            'an entity',
            'You can cancel out of the command by typing "exit" or "abort"'
        ],
        instructions : [
            'Follow the on-screen instructions'
        ]
    },
    history : {
        func : function(phrases) {
            var maxLines = phrases[0];

            validCmds.clear.func();
            socket.emit('history', maxLines);
        },
        help : [
            'Clears the screen and retrieves chat messages from server',
            'The amount you send with the command is the amount of messages ' +
            'that will be returned from each room you follow'
        ],
        instructions : [
            ' Usage:',
            '  history *optional number*',
            ' Example:',
            '  history',
            '  history 25'
        ],
        clearAfterUse : true
    },
    morse : {
        func : function(phrases) {
            if(phrases && phrases.length > 0) {
                var filteredText = phrases.join(' ').toLowerCase();
                var morseCodeText = '';

                filteredText = filteredText.replace(/[åä]/g, 'a');
                filteredText = filteredText.replace(/[ö]/g, 'o');
                filteredText = filteredText.replace(/\s/g, '#');
                filteredText = filteredText.replace(/[^a-z0-9#]/g, '');

                for(var i = 0; i < filteredText.length; i++) {
                    var morseCode = morseCodes[filteredText.charAt(i)];

                    for(var j = 0; j < morseCode.length; j++) {
                        morseCodeText += morseCode[j] + ' ';
                    }

                    morseCodeText += '   ';
                }

                if(morseCodeText.length > 0) {
                    console.log(morseCodeText);
                    socket.emit('morse', {
                        roomName : platformCmds.getLocalVal('room'),
                        morseCode : morseCodeText
                    });
                }
            }
        },
        help : [
            'Sends a morse encoded message (sound) to everyone in the room'
        ],
        instructions : [
            ' Usage:',
            '  morse *message*',
            ' Example:',
            '  morse sos'
        ],
        accessLevel : 9
    },
    password : {
        func : function(phrases) {
            if(phrases && phrases.length > 1) {
                var data = {};
                data.oldPassword = phrases[0];
                data.newPassword = phrases[1];
                data.userName = currentUser;

                if(data.newPassword.length >= 4 &&
                   data.newPassword.length <= 10) {
                    socket.emit('changePassword', data);
                } else {
                    platformCmds.queueMessage({
                        text : [
                            'You have to input the old and new password of ' +
                            'the user',
                            'Example: password old1 new1'
                        ]
                    });
                }
            } else {
                platformCmds.queueMessage({
                    text : [
                        'You have to input the old and new password of the ' +
                        'user',
                        'Example: password old1 new1'
                    ]
                });
            }
        },
        help : [
            'Allows you to change the user password',
            'Password has to be 4 to 10 characters',
            'Don\'t use whitespace in your name or password!'
        ],
        instructions : [
            ' Usage:',
            '  password *oldpassword* *newpassword*',
            ' Example:',
            '  password old1 new1'
        ]
    },
    logout : {
        func : function() {
            socket.emit('logout', currentUser);
            platformCmds.resetAllLocalVals();
        },
        help : ['Logs out from the current user']
    },
    reboot : {
        func : function() {
            window.location.reload();
        },
        help : ['Reboots terminal']
    },
    verifyuser : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var userName = phrases[0];

                if(userName === '*') {
                    socket.emit('verifyAllUsers');
                } else {
                    socket.emit('verifyUser', userName);
                }
            } else {
                socket.emit('unverifiedUsers');
            }
        },
        help : [
            'Verifies a user and allows it to connect to the system',
            'verifyuser without any additional input will show a list of ' +
            'all unverified users',
            'Use "*" to verify everyone in the list'
        ],
        instructions : [
            ' Usage:',
            '  verifyuser',
            '  verifyuser *username*',
            '  verifyuser *',
            ' Example:',
            '  verifyuser',
            '  verifyuser appl1',
            '  verifyuser *'
        ]
    },
    banuser : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var userName = phrases[0];

                socket.emit('ban', userName);
            } else {
                socket.emit('bannedUsers');
            }
        },
        help : [
            'Bans a user and disconnects it from the system',
            'The user will not be able to log on again',
            'banuser without any additional input will show a list of all ' +
            'banned users'
        ],
        instructions : [
            ' Usage:',
            '  banuser',
            '  banuser *username*',
            ' Example:',
            '  banuser',
            '  banuser evil1'
        ],
        accessLevel : 11
    },
    unbanuser : {
        func : function(phrases) {
            if(phrases.length > 0) {
                var userName = phrases[0];

                socket.emit('unban', userName);
            } else {
                socket.emit('bannedUsers');
            }
        },
        help : [
            'Removes ban on user',
            'The user will be able to log on again',
            'ubanuser without any additional input will show a list of all ' +
            'banned users'
        ],
        instructions : [
            ' Usage:',
            '  unbanuser',
            '  unbanuser *username*',
            ' Example:',
            '  unbanuser',
            '  unbanuser evil1'
        ],
        accessLevel : 11
    },
    whisper : {
        func : function(phrases) {
            if(phrases.length > 1) {
                var data = {};

                data.message = {};
                data.roomName = phrases[0];
                data.message.text = [phrases.slice(1).join(' ')];
                data.message.user = currentUser;
                data.message.whisper = true;

                socket.emit('chatMsg', data);
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to write the message!']
                });
            }
        },
        help : [
            'Send a private message to a specific user',
            'The first word that you write will be interpreted as a user name',
            'The rest of the input will be sent to only that user'
        ],
        instructions : [
            ' Usage:',
            '  whisper *user name* *message*',
            ' Example:',
            '  whisper adam hello, adam!',
            '  whisper user1 sounds good!'
        ],
        clearAfterUse : true
    },
    hqmsg : {
        func : function(phrases) {
            if(phrases !== undefined && phrases.length > 0) {
                var writtenMsg = phrases.join(' ');

                socket.emit('chatMsg', {
                    message : {
                        text : [writtenMsg],
                        user : currentUser
                    },
                    roomName : 'hqroom'
                });
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to write the message!']
                });
            }
        },
        help : ['Sends a message directly to HQ'],
        instructions : [
            ' Usage:',
            '  hqmsg *message*',
            ' Example:',
            '  hqmsg is anyone out there?'
        ]
    },
    hackroom : {
        func : function(phrases) {
            var data = {};

            if(phrases.length > 0) {
                data.roomName = phrases[0];
                data.timesCracked = 0;
                data.timesRequired = 3;
                data.randomizer = function(length) {
                    var randomString = '023456789abcdefghijkmnopqrstuvwxyz';
                    var randomLength = randomString.length;
                    var code = '';

                    for(var i = 0; i < length; i++) {
                        var randomVal = Math.random() * (randomLength - 1);

                        code += randomString[Math.round(randomVal)];
                    }

                    return code;
                };
                cmdHelper.data = data;

                platformCmds.queueMessage({
                    text : [
                        //'Razor1911 proudly presents:',
                        //'Room Access Hacking! (RAH)',
                        //'/8iybEVaC1yc2EAAAADAQABAAABAQDS//2ag4/',
                        //'D6Rsc8OO/6wFUVDdpdAItvSCLCrc/dcE/8iybE',
                        //'w3OtlVFnfNkOVAvhObuWO/6wFUVDdkr2yYTaDE',
                        //'i5mB3Nz1aC1yc2buWr6QKLvfZVczAxAHPKLvfZ',
                        //'dK2zXrxGOmOFllxiCbpGOmOFlcJy1/iCbpmA4c',
                        //'MFvEEiKXrxGlxiCbp0miONAAvhObuWO/6ujMJH',
                        //'JHa88/x1DVOFl/yujOMJHa88/x1DVwWl6lsjvS',
                        //'wDDVwWl6el88/x1j5C+k/aadtg1lcvcz7Tdtve',
                        //'k/aadtghxv595Xqw2qrvyp6GrdX/FrhObuWr6Q',
                        //' ',
                        //'Please wait.......',
                        //'Command interception.........ACTIVATED',
                        //'Oracle defense systems.......DISABLED',
                        //'Overriding locks.............DONE',
                        //'Connecting to database ......DONE',
                        //' ',
                        'You can cancel out of the command by typing ' +
                        '"exit" or "abort"',
                        'Press enter to continue'
                    ],
                    speed : 10
                });

                setInputStart('Start');
            } else {
                platformCmds.queueMessage({
                    text : ['You forgot to input the room name!']
                });
                resetCommand(true);
            }
        },
        steps : [
            function() {
                platformCmds.queueMessage({
                    text : ['Checking room access...']
                });
                socket.emit('roomHackable', cmdHelper.data.roomName);
            },
            function() {
                var timeout = 15000;
                var timerEnded = function() {
                    platformCmds.queueMessage({
                        text : [
                            'Your hacking attempt has been detected',
                            'Users of the room has been sent your user name'
                        ]
                    });
                    socket.emit('chatMsg', {
                        message : {
                            text : [
                                'WARNING! Intrustion attempt detected!',
                                'User ' + currentUser + ' tried breaking in'
                            ],
                            user : 'SYSTEM'
                        },
                        roomName : cmdHelper.data.roomName,
                        skipSelfMsg : true
                    });
                    resetCommand(true);
                };

                platformCmds.queueMessage({
                    text : [
                        'Activating cracking bot....',
                        'Warning. Intrusion defense system activated',
                        'Time until detection: ' + '0'
                    ],
                    speed : 1
                });
                setInputStart('Verify seq');
                cmdHelper.data.code = cmdHelper.data.randomizer(10);
                cmdHelper.data.timer = setTimeout(timerEnded, timeout);
                cmdHelper.onStep++;
                platformCmds.queueMessage({
                    text : ['Sequence: ' + cmdHelper.data.code]
                });
            },
            function(phrase) {
                if(phrase === cmdHelper.data.code) {
                    platformCmds.queueMessage({ text : ['Sequence accepted'] });
                    cmdHelper.data.timesCracked++;
                } else {
                    platformCmds.queueMessage({
                        text : [
                            'Incorrect sequence. Counter measures have been ' +
                            'released'
                        ]
                    });
                }

                if(cmdHelper.data.timesCracked <
                   cmdHelper.data.timesRequired) {
                    cmdHelper.data.code = cmdHelper.data.randomizer(10);
                    platformCmds.queueMessage({
                        text : ['Sequence: ' + cmdHelper.data.code]
                    });
                } else {
                    var data = {
                        userName : currentUser,
                        roomName : cmdHelper.data.roomName
                    };

                    clearTimeout(cmdHelper.data.timer);
                    socket.emit('hackRoom', data);
                    platformCmds.queueMessage(({
                        text : [
                            'Cracking complete',
                            'Intrusion defense system disabled',
                            'Suppressing notification and following room',
                            'Thank you for using RAH'
                        ]
                    }));
                    resetCommand();
                }
            }
        ],
        abortFunc : function() {
            clearTimeout(cmdHelper.data.timer);
        },
        help : [
            'ERROR. UNAUTHORIZED COMMAND...AUTHORIZATION OVERRIDDEN. ' +
            'PRINTING INSTRUCTIONS',
            'This command lets you follow a room without knowing the password',
            'It will also supress the following notification',
            'Failing the hack will warn everyone in the room'
        ],
        instructions : [
            ' Usage:',
            '  hackroom *room name*',
            ' Example:',
            '  hackroom secret'
        ]
    }
};

function resetPrevCmdPointer() {
    previousCommandPointer =
        cmdHistory.length > 0 ? cmdHistory.length : 0;
}

// Needed for Android 2.1. trim() is not supported
function trimSpace(sentText) {
    return sentText.replace(/^\s+|\s+$/g, '');
}

function setGain(value) {
    gainNode.gain.value = value;
}

function playMorse(morseCode) {
    function finishSoundQueue(timeouts, morseCode) {
        var cleanMorse = morseCode.replace(/#/g, '');

        soundQueue.splice(0, timeouts);
        platformCmds.queueMessage({
            text : [ 'Morse code message received:  ' + cleanMorse ]
        });
    }

    if(soundQueue.length === 0) {
        soundTimeout = 0;
    }

    for(var i = 0; i < morseCode.length; i++) {
        var duration = 0;
        var shouldPlay = false;

        if(morseCode[i] === '.') {
            duration = 100;
            shouldPlay = true;
        } else if(morseCode[i] === '-') {
            duration = 300;
            shouldPlay = true;
        } else if(morseCode[i] === '#') {
            duration = 100;
        } else {
            duration = 150;
        }

        if(shouldPlay) {
            soundQueue.push(setTimeout(setGain, soundTimeout, 1));
            soundQueue.push(setTimeout(setGain, soundTimeout + duration, 0));
        }

        soundTimeout += duration;
    }

    setTimeout(finishSoundQueue, soundTimeout, (2 * morseCode.length),
        morseCode);
}

function generateMap() {
    var letter = 'B';

    mapHelper.xSize = (mapHelper.rightLong - mapHelper.leftLong) /
                      parseFloat(mapHelper.xGridsMax);
    mapHelper.ySize = (mapHelper.topLat - mapHelper.bottomLat) /
                      parseFloat(mapHelper.yGridsMax);

    for(var xGrid = 0; xGrid < mapHelper.xGridsMax; xGrid++) {
        var currentChar = String.fromCharCode(letter.charCodeAt(0) + xGrid);
        mapHelper.xGrids[currentChar] =
            mapHelper.leftLong + parseFloat(mapHelper.xSize * xGrid);
    }

    for(var yGrid = 0; yGrid < mapHelper.yGridsMax; yGrid++) {
        mapHelper.yGrids[yGrid] =
            mapHelper.topLat - parseFloat(mapHelper.ySize * yGrid);
    }
}

function locateOnMap(latitude, longitude) {
    var xKeys = Object.keys(mapHelper.xGrids);
    var yKeys = Object.keys(mapHelper.yGrids);
    var x;
    var y;

    if(longitude >= mapHelper.leftLong && longitude <= mapHelper.rightLong &&
       latitude <= mapHelper.topLat && latitude >= mapHelper.bottomLat) {

        for(var xGrid = 0; xGrid < xKeys.length; xGrid++) {
            var nextXGrid = mapHelper.xGrids[xKeys[xGrid + 1]];

            if(longitude < nextXGrid) {
                x = xKeys[xGrid];
                break;
            } else if(longitude === (nextXGrid + parseFloat(mapHelper.xSize))) {
                x = xKeys[xGrid + 1];
                break;
            }
        }

        for(var yGrid = 0; yGrid < yKeys.length; yGrid++) {
            var nextYGrid = mapHelper.yGrids[yKeys[yGrid + 1]];

            if(latitude > nextYGrid) {
                y = yKeys[yGrid];
                break;
            } else if(latitude === (nextYGrid - parseFloat(mapHelper.ySize))) {
                y = yKeys[yGrid + 1];
                break;
            }
        }
    }

    if(x !== undefined && y !== undefined) {
        return x + '' + y;
    } else {
        return 'Out of area';
    }
}

function reconnect() {
    socket.disconnect();
    socket.connect({ forceNew : true });

    if(currentUser) {
        socket.emit('updateId', { userName : currentUser });
    }
}

// Some devices disable Javascript when screen is off (iOS)
// They also fail to notice that they have been disconnected
// We check the time between heartbeats and if the time is
// over 10 seconds (e.g. when screen is turned off and then on)
// we force them to reconnect
function isScreenOff() {
    var now = (new Date()).getTime();
    var diff = now - lastInterval;
    var offBy = diff - 1000;
    lastInterval = now;

    if(offBy > 10000) {
        reconnect();
    }
}

// Set intervals at boot and recreate them when the window is focused
// This is to make sure that nothing has been killed in the background
function setIntervals() {
    if(interval.printText !== undefined) {
        clearInterval(interval.printText);
    }
    if(interval.tracking !== undefined) {
        clearInterval(interval.tracking);
    }

    // Prints messages from the queue
    interval.printText = setInterval(printText, 200, messageQueue);

    if(tracking) {
        // Gets new geolocation data
        interval.tracking = setInterval(sendLocationData, 1000);
    }

    // Should not be recreated on focus
    if(interval.isScreenOff === undefined) {
        // Checks time between when JS stopped and started working again
        // This will be most frequently triggered when a user turns off the
        // screen on their phone and turns it back on
        interval.isScreenOff = setInterval(isScreenOff, 1000);
    }
}

function startAudio() {
    // Not supported in Spartan nor IE11 or lower
    if(window.AudioContext || window.webkitAudioContext) {
        if(window.AudioContext) {
            audioCtx = new window.AudioContext();
        } else if(window.webkitAudioContext) {
            audioCtx = new window.webkitAudioContext();
        }
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        gainNode.gain.value = 0;
        oscillator.type = 'sine';
        oscillator.frequency.value = '440';

        oscillator.start(0);
    }
}

function getLeftText(marker) {
    return marker.parentElement.childNodes[0].textContent;
}

function getRightText(marker) {
    return marker.parentElement.childNodes[2].textContent;
}

function getInputText() {
    return inputText.textContent;
}

function setLeftText(text) {
    marker.parentElement.childNodes[0].textContent = text;
}

function appendToLeftText(text) {
    marker.parentElement.childNodes[0].textContent += text;
}

function setRightText(text) {
    marker.parentElement.childNodes[2].textContent = text;
}

function prependToRightText(sentText) {
    marker.parentElement.childNodes[2].textContent =
        sentText + marker.parentElement.childNodes[2].textContent;
}

function setMarkerText(text) {
    marker.value = text;
}

function setInputStart(text) {
    inputStart.textContent = text;
}

function getInputStart() {
    return inputStart.textContent;
}

// Needed for arrow and delete keys. They are not detected with keypress
function specialKeyPress(event) {
    var keyCode = (typeof event.which === 'number') ? event.which :
                  event.keyCode;

    switch(keyCode) {
        // Backspace
        case 8:
            // Remove character to the left of the marker
            if(getLeftText(marker)) {
                setLeftText(getLeftText(marker).slice(0, -1));
            }

            event.preventDefault();

            break;
        // Tab
        case 9:
            if(!cmdHelper.keyboardBlocked &&
               cmdHelper.command === null) {
                autoComplete();
            }

            event.preventDefault();

            break;
        // Delete
        case 46:
            // Remove character from marker and move it right
            if(getRightText(marker)) {
                setMarkerText(getRightText(marker)[0]);
                setRightText(getRightText(marker).slice(1));
            } else {
                setMarkerText(' ');
            }

            event.preventDefault();

            break;
        // Page up
        case 33:
            window.scrollBy(0, -window.innerHeight);

            event.preventDefault();

            break;
        //Page down
        case 34:
            window.scrollBy(0, window.innerHeight);

            event.preventDefault();

            break;
        // Left arrow
        case 37:
            // Moves the marker one step to the left
            if(getLeftText(marker)) {
                prependToRightText(marker.value);
                setMarkerText(getLeftText(marker).slice(-1));
                setLeftText(getLeftText(marker).slice(0, -1));
            }

            event.preventDefault();

            break;
        // Right arrow
        case 39:
            // Moves marker one step to the right
            if(getRightText(marker)) {
                appendToLeftText(marker.value);
                setMarkerText(getRightText(marker)[0]);
                setRightText(getRightText(marker).slice(1));
            }

            event.preventDefault();

            break;
        // Up arrow
        case 38:
            if(!cmdHelper.keyboardBlocked &&
               cmdHelper.command === null) {
                if(previousCommandPointer > 0) {
                    clearInput();
                    previousCommandPointer--;
                    appendToLeftText(cmdHistory[previousCommandPointer]);
                }
            }

            event.preventDefault();

            break;
        // Down arrow
        case 40:
            if(!cmdHelper.keyboardBlocked &&
               cmdHelper.command === null) {
                if(previousCommandPointer < cmdHistory.length - 1) {
                    clearInput();
                    previousCommandPointer++;
                    appendToLeftText(cmdHistory[previousCommandPointer]);
                } else if(previousCommandPointer ===
                          cmdHistory.length - 1) {
                    clearInput();
                    previousCommandPointer++;
                } else {
                    clearInput();
                }
            }

            event.preventDefault();

            break;
        default:
            break;
    }
}

function keyPress(event) {
    var keyCode = (typeof event.which === 'number') ? event.which :
                  event.keyCode;
    var markerParentsChildren = marker.parentElement.childNodes;
    var markerLocation;

    for(var i = 0; i < markerParentsChildren.length; i++) {
        if(markerParentsChildren[i] === marker) {
            markerLocation = i;
            break;
        }
    }

    switch(keyCode) {
        // Enter
        case 13:
            if(!cmdHelper.keyboardBlocked) {
                if(cmdHelper.command !== null) {
                    var phrase = trimSpace(getInputText().toLowerCase());

                    if(phrase === 'exit' || phrase === 'abort') {
                        if(validCmds[cmdHelper.command].abortFunc) {
                            validCmds[cmdHelper.command].abortFunc();
                        }

                        resetCommand(true);
                    } else {
                        platformCmds.queueMessage({
                            text : [phrase]
                        });

                        validCmds[cmdHelper.command].steps[cmdHelper.onStep](
                            phrase, socket
                        );
                    }
                } else {
                    var inputText = getInputText().toLowerCase();
                    var phrases = trimSpace(inputText).split(' ');
                    var command = null;
                    var commandName;

                    if(phrases[0].length > 0) {
                        if(platformCmds.getLocalVal('mode') ===
                           'normalmode') {
                            commandName = phrases[0];
                            command = validCmds[commandName];
                        } else {
                            var sign = phrases[0].charAt(0);

                            if(sign === '-') {
                                commandName = phrases[0].slice(1);
                                command = validCmds[commandName];
                            }
                        }

                        if(currentUser !== null && command &&
                           (isNaN(command.accessLevel) ||
                            currentAccessLevel >= command.accessLevel)) {
                            // Store the command for usage with up/down arrows
                            cmdHistory.push(phrases.join(' '));
                            platformCmds.setLocalVal(
                                'cmdHistory',
                                JSON.stringify(cmdHistory)
                            );

                            // Print input if the command shouldn't clear
                            // after use
                            if(!command.clearAfterUse) {
                                var cmdUsedMsg = {
                                    text : [
                                        getInputStart() + getMode() + '$ ' +
                                            getInputText()
                                    ]
                                };

                                platformCmds.queueMessage(cmdUsedMsg);
                            }

                            // Print the help and instruction parts of
                            // the command
                            if(phrases[1] === '-help') {
                                var helpMsg = { text : [] };

                                if(command.help) {
                                    helpMsg.text =
                                        helpMsg.text.concat(command.help);
                                }

                                if(command.instructions) {
                                    helpMsg.text =
                                        helpMsg.text.concat(
                                            command.instructions
                                        );
                                }

                                if(helpMsg.text.length > 0) {
                                    platformCmds.queueMessage(helpMsg);
                                }
                            } else {
                                if(command.steps) {
                                    cmdHelper.command = commandName;
                                    cmdHelper.maxSteps = command.steps.length;
                                }

                                command.func(phrases.splice(1));
                            }
                            // A user who is not logged in will have access
                            // to register and login commands
                        } else if(currentUser === null && command &&
                                  (commandName === 'register' ||
                                   commandName === 'login')) {
                            platformCmds.queueMessage({
                                text : [getInputStart() + getInputText()]
                            });
                            command.func(phrases.splice(1));
                        } else if(platformCmds.getLocalVal('mode') ===
                                  'chatmode' && phrases[0].length > 0) {
                            validCmds.msg.func(phrases);
                        } else if(currentUser === null) {
                            platformCmds.queueMessage({
                                text : [
                                    'You must register a new user or login ' +
                                    'with an existing user',
                                    'Use command "register" or "login"',
                                    'e.g. register myname 1135',
                                    'or login myname 1135'
                                ]
                            });
                            // Sent command was not found.
                            // Print the failed input
                        } else if(commandName.length > 0) {
                            platformCmds.queueMessage({
                                text : ['- ' + phrases[0] + ': ' +
                                        commandFailText.text]
                            });
                        }
                    }
                }
            }

            resetPrevCmdPointer();
            clearInput();

            break;
        default:
            var textChar = String.fromCharCode(keyCode);

            if(isAllowedChar(textChar)) {
                if(textChar) {
                    appendToLeftText(textChar);
                }

                if(triggerAutoComplete(getLeftText(marker)) &&
                   cmdHelper.command === null) {
                    autoComplete();
                }
            }

            break;
    }

    event.preventDefault();
}

function setRoom(roomName) {
    platformCmds.setLocalVal('room', roomName);
    setInputStart(roomName);
    platformCmds.queueMessage({ text : ['Entered ' + roomName] });
}

function setCommand(sentCommand) {
    cmdHelper.command = sentCommand;
}

function resetCommand(aborted) {
    cmdHelper.command = null;
    cmdHelper.onStep = 0;
    cmdHelper.maxSteps = 0;
    setInputStart(platformCmds.getLocalVal('room'));
    cmdHelper.keyboardBlocked = false;
    cmdHelper.data = null;

    if(aborted) {
        platformCmds.queueMessage({
            text : ['Aborting command']
        });
    }
}

function setMode(text) {
    modeField.textContent = text;
}

function getMode() {
    return modeField.textContent;
}

function clearInput() {
    setLeftText('');
    setRightText('');
    // Fix for blinking marker
    setMarkerText(' ');
}

// Taken from http://stackoverflow.com/questions/639695/
// how-to-convert-latitude-or-longitude-to-meters/11172685#11172685
// generally used geo measurement function
function measureDistance(lat1, lon1, lat2, lon2) {
    var R = 6378.137; // Radius of earth in KM
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d * 1000; // meters
}

function locationData() {
    if('geolocation' in navigator) {
        navigator.geolocation.watchPosition(function(position) {
            if(position !== undefined) {
                // Geolocation object is empty when sent through Socket.IO
                // This is a fix for that
                // TODO: Duplicate code
                var tempPosition = {};
                tempPosition.latitude = position.coords.latitude;
                tempPosition.longitude = position.coords.longitude;
                tempPosition.speed = position.coords.speed;
                tempPosition.accuracy = position.coords.accuracy;
                tempPosition.heading = position.coords.heading;
                tempPosition.timestamp = position.timestamp;

                oldPosition = currentPosition;
                currentPosition = position;
            }
        }, function(err) {
            if(err.code === err.PERMISSION_DENIED) {
                tracking = false;
                clearInterval(interval.tracking);
                platformCmds.queueMessage({
                    text : [
                        'Unable to connect to the tracking satellites',
                        'Turning off tracking is a major offense',
                        'Organica Death Squads have been sent to scour the area'
                    ], extraClass : 'importantMsg'
                });
            } else {
                console.log(err);
            }
        }, { enableHighAccuracy : true });
    }
}

function sendLocationData() {
    if(currentUser !== null && currentPosition !== oldPosition) {
        // Geolocation object is empty when sent through Socket.IO
        // This is a fix for that
        // TODO: Duplicate code
        var tempPosition = {};
        tempPosition.latitude = currentPosition.coords.latitude;
        tempPosition.longitude = currentPosition.coords.longitude;
        tempPosition.speed = currentPosition.coords.speed;
        tempPosition.accuracy = currentPosition.coords.accuracy;
        tempPosition.heading = currentPosition.coords.heading;
        tempPosition.timestamp = currentPosition.timestamp;

        oldPosition = currentPosition;

        socket.emit('updateLocation', tempPosition);
    }
}

function autoComplete() {
    var phrases = trimSpace(getInputText().toLowerCase()).split(' ');
    var partialCommand = phrases[0];
    var commands = Object.keys(validCmds);
    var matched = [];

    // Auto-complete should only trigger when one phrase is in the input
    // It will not auto-complete flags
    // If chat mode and the command is prepended or normal mode
    if(phrases.length === 1 && partialCommand.length > 0 &&
       ((platformCmds.getLocalVal('mode') === 'chatmode' &&
         partialCommand.charAt(0) === '-') ||
        (platformCmds.getLocalVal('mode') === 'normalmode'))) {
        // Removes prepend sign, which is required for commands in chat mode
        if(platformCmds.getLocalVal('mode') === 'chatmode') {
            partialCommand = partialCommand.slice(1);
        }

        for(var i = 0; i < commands.length; i++) {
            var matches = false;

            for(var j = 0; j < partialCommand.length; j++) {
                var commandAccessLevel = validCmds[commands[i]].accessLevel;

                if((isNaN(commandAccessLevel) ||
                    currentAccessLevel >= commandAccessLevel) &&
                   partialCommand.charAt(j) === commands[i].charAt(j)) {
                    matches = true;
                } else {
                    matches = false;

                    break;
                }
            }

            if(matches) {
                matched.push(commands[i]);
            }
        }

        if(matched.length === 1) {
            var newText = '';

            if(platformCmds.getLocalVal('mode') === 'chatmode') {
                newText += '-';
            }

            newText += matched[0] + ' ';

            clearInput();
            setLeftText(newText);
        } else if(matched.length > 0) {
            var msg = '';

            matched.sort();

            for(var cmdMatched = 0; cmdMatched < matched.length; cmdMatched++) {
                msg += matched[cmdMatched] + '\t';
            }

            platformCmds.queueMessage({ text : [msg] });
        }
        // No input? Show all available commands
    } else if(partialCommand.length === 0) {
        validCmds.help.func();
    }

}

function isAllowedChar(text) {
    return /^[a-zA-Z0-9åäöÅÄÖ/\s\-_\.,;:!"\*'\?\+=&\)\(]+$/g.test(text);
}

function triggerAutoComplete(text) {
    if(text.charAt(text.length - 1) === ' ' &&
       text.charAt(text.length - 2) === ' ') {
        setLeftText(trimSpace(text));

        return true;
    }

    return false;
}

function scrollView() {
    spacer.scrollIntoView();
}

// Calculates amount of time to print text (speed times amount of
// characters plus buffer)
function calculateTimer(text, speed) {
    var timeout = isNaN(speed) ? charTimeout : speed;

    return (text.length * timeout) + rowTimeout;
}

// Prints one letter and decreases in progress tracker
function printLetter(span, character) {
    var textNode = document.createTextNode(character);
    var spanHeight = span.offsetHeight;

    span.appendChild(textNode);
    charsInProgress--;

    if(span.offsetHeight > spanHeight) {
        scrollView();
    }
}

function addLetters(span, text, speed) {
    var lastTimeout = 0;
    var timeout = isNaN(speed) ? charTimeout : speed;

    for(var i = 0; i < text.length; i++) {
        setTimeout(printLetter, timeout + lastTimeout, span, text.charAt(i));

        lastTimeout += timeout;
    }
}

function addRow(text, speed, extraClass) {
    var row = document.createElement('li');
    var span = document.createElement('span');

    if(extraClass) {
        // classList doesn't work on older devices, thus the usage of className
        row.className += ' ' + extraClass;
    }

    row.appendChild(span);
    mainFeed.appendChild(row);

    if(isNaN(speed) || speed > 0) {
        addLetters(span, text, speed);
    } else {
        var textNode = document.createTextNode(text);

        span.appendChild(textNode);
        charsInProgress -= text.length;
    }

    scrollView();
}

// Adds time stamp and room name to a string from a message if they are set
function generateFullText(sentText, message) {
    var text = '';

    if(message.time) {
        text += generateShortTime(message.time);
    }
    if(message.roomName) {
        text += message.roomName !== platformCmds.getLocalVal('room') ?
                '[' + message.roomName + '] ' : '';
    }
    if(message.user) {
        text += message.user + ': ';
    }

    text += sentText;

    return text;
}

// Counts all characters in the message array and returns it
function countTotalCharacters(messageQueue) {
    var total = 0;

    for(var i = 0; i < messageQueue.length; i++) {
        var message = messageQueue[i];

        for(var j = 0; j < message.text.length; j++) {
            var text = generateFullText(message.text[j], message);
            total += text.length;
        }
    }

    return total;
}

// Prints messages from the queue
// It will not continue if a print is already in progress,
// which is indicated by charsInProgress being > 0
function printText(messageQueue) {
    if(charsInProgress === 0) {
        // Amount of time (milliseconds) for a row to finish printing
        var nextTimeout = 0;
        var shortQueue = messageQueue.splice(0, 3);

        charsInProgress = countTotalCharacters(shortQueue);

        if(charsInProgress > 0) {
            while(shortQueue.length > 0) {
                var message = shortQueue.shift();
                var speed = message.speed;

                if(message.text != null) {
                    while(message.text.length > 0) {
                        var text = message.text.shift();
                        var fullText = generateFullText(text, message);

                        setTimeout(addRow, nextTimeout, fullText, speed,
                                   message.extraClass);

                        nextTimeout += calculateTimer(fullText, speed);
                    }
                }
            }
        }
    }
}

// Takes date and returns shorter readable time
function generateShortTime(date) {
    var newDate = new Date(date);
    var minutes = (newDate.getMinutes() < 10 ? '0' : '') + newDate.getMinutes();
    var hours = (newDate.getHours() < 10 ? '0' : '') + newDate.getHours();

    return hours + ':' + minutes + ' ';
}

function startSocketListeners() {
    if(socket) {
        socket.on('chatMsg', function(message) {
            platformCmds.queueMessage(message);
        });

        socket.on('message', function(message) {
            platformCmds.queueMessage(message);
        });

        socket.on('broadcastMsg', function(message) {
            platformCmds.queueMessage(message);
        });

        socket.on('importantMsg', function(msg) {
            var message = msg;

            message.extraClass = 'importantMsg';

            platformCmds.queueMessage(message);

            if(message.morse) {
                validCmds.morse.func(message.text);
            }
        });

        socket.on('multiMsg', function(messages) {
            for(var i = 0; i < messages.length; i++) {
                platformCmds.queueMessage(messages[i]);
            }
        });

        // Triggers when the connection is lost and then re-established
        socket.on('reconnect', reconnect);

        socket.on('disconnect', function() {
            platformCmds.queueMessage({
                text : ['Lost connection'],
                extraClass : 'importantMsg'
            });
        });

        socket.on('follow', function(room) {
            if(room.entered) {
                setRoom(room.roomName);
            } else {
                platformCmds.queueMessage({
                    text : ['Following ' + room.roomName]
                });
            }
        });

        socket.on('unfollow', function(room) {
            platformCmds.queueMessage({
                text : ['Stopped following ' + room.roomName]
            });

            if(room.exited) {
                setInputStart('public');
                platformCmds.setLocalVal('room', 'public');
                socket.emit('follow', { roomName : 'public', entered : true });
            }
        });

        socket.on('login', function(user) {
            platformCmds.setLocalVal('user', user.userName);
            currentUser = user.userName;
            currentAccessLevel = user.accessLevel;
            platformCmds.queueMessage({
                text : ['Successfully logged in as ' + user.userName]
            });
            socket.emit('follow', { roomName : 'public', entered : true });
        });

        socket.on('commandSuccess', function(data) {
            cmdHelper.onStep++;
            validCmds[cmdHelper.command].steps[cmdHelper.onStep](data, socket);
        });

        socket.on('commandFail', function() {
            resetCommand(true);
        });

        socket.on('reconnectSuccess', function(data) {
            if(!data.firstConnection) {
                platformCmds.queueMessage({
                    text : ['Re-established connection'],
                    extraClass : 'importantMsg'
                });
                platformCmds.queueMessage({
                    text : ['Retrieving missed messages (if any)']
                });
            } else {
                currentAccessLevel = data.user.accessLevel;

                platformCmds.queueMessage({
                    text : [
                        'Welcome, employee ' + currentUser,
                        'Did you know that you can auto-complete ' +
                        'commands by using ' +
                        'the tab button or writing double spaces?',
                        'Learn this valuable skill to increase ' +
                        'your productivity!',
                        'May you have a productive day',
                        '## This terminal has been cracked by your friendly ' +
                        'Razor1911 team. Enjoy! ##'
                    ]
                });

                if(platformCmds.getLocalVal('room')) {
                    var room = platformCmds.getLocalVal('room');
                    validCmds.enterroom.func([room]);
                }
            }

            if(platformCmds.getLocalVal('mode') === null) {
                validCmds.normalmode.func();
            } else {
                var mode = platformCmds.getLocalVal('mode');

                validCmds[mode].func();
            }

            locationData();
        });

        socket.on('disconnectUser', function() {
            var currentUser = platformCmds.getLocalVal('user');

            // There is no saved local user. We don't need to print this
            if(currentUser !== null) {
                platformCmds.queueMessage({
                    text : [
                        'Didn\'t find user ' +
                        platformCmds.getLocalVal('user') +
                        ' in database',
                        'Resetting local configuration'
                    ]
                });
            }

            platformCmds.resetAllLocalVals();
        });

        socket.on('morse', function(morseCode) {
            playMorse(morseCode);
        });

        socket.on('time', function(time) {
            platformCmds.queueMessage({
                text : ['Time: ' + generateShortTime(time)]
            });
        });

        socket.on('locationMsg', function(locationData) {
            var locationKeys = Object.keys(locationData);

            for(var i = 0; i < locationKeys.length; i++) {
                var user = locationKeys[i];

                if(locationData[user].coords) {
                    var userLoc = locationData[user];
                    var latitude = userLoc.coords.latitude;
                    var longitude = userLoc.coords.longitude;
                    var heading = userLoc.coords.heading !== null ?
                                  Math.round(userLoc.coords.heading) : null;
                    var text = '';

                    text += 'User: ' + user + ' - ';
                    text +=
                        'Last seen: ' + generateShortTime(userLoc.lastSeen) +
                        '- ';
                    text += 'Location: ' +
                            locateOnMap(latitude, longitude) + ' - ';

                    if(heading !== null) {
                        text += 'Heading: ' + heading + ' deg. - ';
                    }

                    text += 'Coordinates: ' + latitude + ', ' + longitude;

                    platformCmds.queueMessage({ text : [text] });
                }
            }
        });

        socket.on('ban', function() {
            platformCmds.queueMessage({
                text : [
                    'You have been banned from the system',
                    'Contact your nearest Organica IT Support ' +
                    'Center for re-education',
                    '## or your nearest friendly Razor1911 member. ' +
                    'Bring a huge bribe ##'
                ],
                extraClass : 'importantMsg'
            });
            platformCmds.resetAllLocalVals();
        });
    }
}

// Sets everything relevant when a user enters the site
function startBoot() {
    var background = document.getElementById('background');
    background.addEventListener('click', function(event) {
        marker.focus();
        event.preventDefault();
    });

    // DOM element init
    mainFeed = document.getElementById('mainFeed');
    marker = document.getElementById('marker');
    inputText = document.getElementById('inputText');
    inputStart = document.getElementById('inputStart');
    modeField = document.getElementById('mode');
    spacer = document.getElementById('spacer');

    cmdHistory = platformCmds.getLocalVal('cmdHistory') ?
                     JSON.parse(platformCmds.getLocalVal('cmdHistory')) : [];
    currentUser = platformCmds.getLocalVal('user');
    currentAccessLevel = 1;
    oldPosition = {};
    currentPosition = {};

    charTimeout = 2;
    rowTimeout = 50;
    messageQueue = [];
    charsInProgress = 0;

    socket = io();

    startSocketListeners();
    addEventListener('keypress', keyPress);
    // Needed for some special keys. They are not detected with keypress
    addEventListener('keydown', specialKeyPress);
    addEventListener('focus', setIntervals);

    resetPrevCmdPointer();
    generateMap();
    setIntervals();
    startAudio();

    platformCmds.queueMessage(logo);

    socket.emit('updateId', { userName : currentUser, firstConnection : true });
}

startBoot();