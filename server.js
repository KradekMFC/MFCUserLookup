var express = require('express');
var WebSocket = require('ws');
var _  = require('underscore');
_.str = require('underscore.string');
_.mixin(_.str.exports());
_.str.include('Underscore.string', 'string'); // => true

var app = express();

var port = process.env.PORT || 1337;

app.get('/', function(req, res, next) {
    var socket = new MFCSocket();
    socket.listen("loggedin", function(e){
        socket.send(new MFCMessage({Type: MFCMessageType.FCTYPE_USERNAMELOOKUP, From: 0, To: 0, Arg1: 20, Arg2: 0, Data: req.query.username}));
        socket.listen("message", function(m){
            if (!(m.Type == MFCMessageType.FCTYPE_USERNAMELOOKUP))
                return;
            if (m.Arg2 == MFCResponseType.FCRESPONSE_ERROR)
                res.json({error: "User does not exist or MFC error."})

            res.json(m.Data);
        })
    });
});

app.listen(port);


function MFCSocket(name, passCode){
    //list of websocket chat servers
    var servers = [
        { Name: "xchat11", Type: "hybi00" },
        { Name: "xchat12", Type: "hybi00" },
        { Name: "xchat20", Type: "hybi00" },
        { Name: "xchat7", Type: "rfc6455" },
        { Name: "xchat8", Type: "rfc6455" },
        { Name: "xchat9", Type: "rfc6455" },
        { Name: "xchat10", Type: "rfc6455" }
    ];
    //choose a random server
    var server = servers[Math.floor(Math.random() * servers.length)];
    var serverUrl = _.sprintf("ws://%s.myfreecams.com:8080/fcsl", server.Name);

    //private variables
    var sessionId = null;
    var userName = null;
    var loggedIn = false;

    //extremely basic event system
    var listeners = [];
    function _listen(evt, callback){
        var validEvents = ["message", "error", "close", "loggedin"];

        if (!(validEvents.indexOf(evt) >= 0))
            throw new Error(_.sprintf("%s is not a valid event.", evt));

        //dont add the same callback twice
        var matches = listeners.filter(function(listener){
            return (listener.Event == evt) && (listener.Callback == callback);
        });
        if (matches.length > 0)
            return;

        listeners.push({Event: evt, Callback: callback});
    }
    function fire(evt, data){
        listeners.filter(function(listener){
            return listener.Event === evt;
        }).forEach(function(listener){
                listener.Callback(data);
            });
    }
    function _removeListener(evt, listener){
        var found;

        for (var i=0; i < listeners.length; i++){
            if (listeners[i].Event === evt && listeners[i].Callback === listener){
                found = i;
                break;
            }
        }

        if (null !== found)
            listeners.splice(found, 1);
    }

    //socket event handlers
    function onSocketClosed(msg){
        console.log("socket closed");
        fire("close", msg);
    }
    function onSocketOpened(){
        socket.send("hello fcserver\n\0");
        //login as a guest
        var loginString = (name || "guest") + ":" + (passCode || "guest");
        socket.send(new MFCMessage({Type:MFCMessageType.FCTYPE_LOGIN, From:0, To:0, Arg1:"20071025",Arg2:0,Data: loginString}).asMFCMessage());
        //set up a ping to the server so it doesn't
        //drop connection on us
        setInterval(function(){
            socket.send(new MFCMessage({Type:MFCMessageType.FCTYPE_NULL, From:0, To:0, Arg1:0, Arg2:0}).asMFCMessage());
        }, 15000);
    }
    function onSocketError(err){
        fire("error", err);
    }
    var queued;
    function onSocketMessage(msg){
        var serverMessage = msg.data;
        //queued = serverMessage.replace(/\r\n/g, ""); //strip out any inserted carriage returns
        queued = serverMessage;
        while (queued.length > 12){
            var dataLength = parseInt(queued.substring(0,4),10);

            if (queued.length < dataLength + 4)
                return; //wait for more data

            var data = queued.substring(4, dataLength + 4);

            if (data.length !== dataLength)
                break; //malformed message

            onMFCMessage(data);

            queued = queued.substring(dataLength + 4);
        }

        queued = "";
    }

    //send message
    var sendMessageQueue = [];
    function sendMessage(msg){
        //if there is a msg and its not an MFCMessage, leave
        if ((undefined !== msg) && !(msg instanceof MFCMessage))
            throw new Error("msg is not an instance of MFCMessage");
        else
            sendMessageQueue.push(msg);

        //indicate a problem if the socket is closed
        if (socket.readyState === 3 || socket.readyState === 2) //closed, closing
            throw new Error("Attempt to send message while socket was closing or closed.");

        //if the socket is open process the queue
        if (socket.readyState === 1 && null !== sessionId){
            var currentMsg = sendMessageQueue.pop();
            while (undefined !== currentMsg){
                socket.send(currentMsg.asMFCMessage());
                currentMsg = sendMessageQueue.pop();
            }
        }
        else {
            //otherwise, try again later
            setTimeout(sendMessage, 100);
        }
    }

    //internal message handler
    function onMFCMessage(msg){
        var parsedMsg = new MFCMessage(msg);

        //capture the sessionid and assigned username
        if (MFCMessageType.FCTYPE_LOGIN == parsedMsg.Type) {
            sessionId = parsedMsg.To;
            userName = parsedMsg.Data;
            loggedIn = true;
            fire("loggedin", {Username: userName, SessionId: sessionId});
        }

        fire("message", parsedMsg);
    }

    //try to create a socket
    var socket;
    try
    {
        socket = new WebSocket(serverUrl);
    }
    catch(e)
    {
        throw new Error("This browser does not implement WebSockets.");
        return;
    }

    socket.onopen =  onSocketOpened;
    socket.onmessage = onSocketMessage;
    socket.onerror = onSocketError;
    socket.onclose = onSocketClosed;

    this.listen = _listen;
    this.removeListener = _removeListener;
    this.send = sendMessage;
    this.loggedIn = function(){
        return loggedIn;
    }
    this.getSessionId = function() {
        return sessionId;
    }
    this.logout = function(){
        listeners = [];
        socket.close();
    }

};

function MFCMessage(initializer){
    var self = this;

    if ("string" === typeof(initializer)){
        //strip out newlines
        initializer = initializer.replace(/(\r\n|\n|\r)/gm, "");

        //parse out the typical pieces
        ["Type","From","To","Arg1","Arg2"].forEach(function(part){
            var delimiterPos = initializer.indexOf(" ");
            self[part] = initializer.substring(0, delimiterPos);
            initializer = initializer.substring(delimiterPos + 1)
        });

        //convert Type to an int
        self.Type = parseInt(self.Type,10);

        //parse out data if there is any
        if (initializer.length > 0){

            if (self.Type != MFCMessageType.FCTYPE_LOGIN) {
                var jsonPayload = [
                    MFCMessageType.FCTYPE_DETAILS,
                    MFCMessageType.FCTYPE_ADDFRIEND,
                    MFCMessageType.FCTYPE_ADDIGNORE,
                    MFCMessageType.FCTYPE_SESSIONSTATE,
                    MFCMessageType.FCTYPE_CMESG,
                    MFCMessageType.FCTYPE_PMESG,
                    MFCMessageType.FCTYPE_TXPROFILE,
                    MFCMessageType.FCTYPE_USERNAMELOOKUP,
                    MFCMessageType.FCTYPE_MYCAMSTATE,
                    MFCMessageType.FCTYPE_SETGUESTNAME
                ];

                if (jsonPayload.indexOf(self.Type) != -1 ||
                    (self.Type == MFCMessageType.FCTYPE_JOINCHAN && self.Arg2 == MFCMessageType.FCCHAN_PART)) {
                    var parsed;
                    try {
                        parsed = JSON.parse(unescape(initializer));
                    } catch(err){}
                    self.Data = parsed;
                }
            }
            else
                self.Data = initializer;
        }
    }

    if ("object" === typeof(initializer)){
        _.extend(self, initializer);
    }

    self.asMFCMessage = function asMFCMessage(){
        var msg = _.sprintf("%s %s %s %s %s", self.Type, self.From, self.To, self.Arg1, self.Arg2);
        if (undefined !== self.Data){
            msg += " " + self.Data;
        }
        msg += "\n\0";
        return msg;
    }
}

var MFCMessageType = {
    FCTYPE_NULL : 0,
    FCTYPE_LOGIN : 1,
    FCTYPE_ADDFRIEND : 2,
    FCTYPE_PMESG : 3,
    FCTYPE_STATUS : 4,
    FCTYPE_DETAILS : 5,
    FCTYPE_TOKENINC : 6,
    FCTYPE_ADDIGNORE : 7,
    FCTYPE_PRIVACY : 8,
    FCTYPE_ADDFRIENDREQ : 9,
    FCTYPE_USERNAMELOOKUP : 10,
    FCTYPE_ANNOUNCE : 13,
    FCTYPE_STUDIO : 14,
    FCTYPE_INBOX : 15,
    FCTYPE_RELOADSETTINGS : 17,
    FCTYPE_HIDEUSERS : 18,
    FCTYPE_RULEVIOLATION : 19,
    FCTYPE_SESSIONSTATE : 20,
    FCTYPE_REQUESTPVT : 21,
    FCTYPE_ACCEPTPVT : 22,
    FCTYPE_REJECTPVT : 23,
    FCTYPE_ENDSESSION : 24,
    FCTYPE_TXPROFILE : 25,
    FCTYPE_STARTVOYEUR : 26,
    FCTYPE_SERVERREFRESH : 27,
    FCTYPE_SETTING : 28,
    FCTYPE_BWSTATS : 29,
    FCTYPE_SETGUESTNAME : 30,
    FCTYPE_SETTEXTOPT : 31,
    FCTYPE_MODELGROUP : 33,
    FCTYPE_REQUESTGRP : 34,
    FCTYPE_STATUSGRP : 35,
    FCTYPE_GROUPCHAT : 36,
    FCTYPE_CLOSEGRP : 37,
    FCTYPE_UCR : 38,
    FCTYPE_MYUCR : 39,
    FCTYPE_SLAVEVSHARE : 43,
    FCTYPE_ROOMDATA : 44,
    FCTYPE_NEWSITEM : 45,
    FCTYPE_GUESTCOUNT : 46,
    FCTYPE_MODELGROUPSZ : 48,
    FCTYPE_CMESG : 50,
    FCTYPE_JOINCHAN : 51,
    FCTYPE_CREATECHAN : 52,
    FCTYPE_INVITECHAN : 53,
    FCTYPE_KICKCHAN : 54,
    FCTYPE_BANCHAN : 56,
    FCTYPE_PREVIEWCHAN : 57,
    FCTYPE_SETWELCOME : 61,
    FCTYPE_LISTCHAN : 63,
    FCTYPE_TAGS : 64,
    FCTYPE_UEOPT : 67,
    FCTYPE_METRICS : 69,
    FCTYPE_OFFERCAM : 70,
    FCTYPE_REQUESTCAM : 71,
    FCTYPE_MYWEBCAM : 72,
    FCTYPE_MYCAMSTATE : 73,
    FCTYPE_PMHISTORY : 74,
    FCTYPE_CHATFLASH : 75,
    FCTYPE_TRUEPVT : 76,
    FCTYPE_REMOTEPVT : 77,
    FCTYPE_ZGWINVALID : 95,
    FCTYPE_CONNECTING : 96,
    FCTYPE_CONNECTED : 97,
    FCTYPE_DISCONNECTED : 98,
    FCTYPE_LOGOUT : 99
};
var MFCChatOpt = {
    FCCHAN_NOOPT: 0,
    FCCHAN_JOIN: 1,
    FCCHAN_PART: 2,
    FCCHAN_BATCHPART: 64,
    FCCHAN_OLDMSG: 4,
    FCCHAN_HISTORY: 8,
    FCCHAN_CAMSTATE: 16,
    FCCHAN_WELCOME: 32
};
var MFCVideoState = {
    FCVIDEO_TX_IDLE: 0, //in public room
    FCVIDEO_TX_RESET: 1,
    FCVIDEO_TX_AWAY: 2,
    FCVIDEO_TX_CONFIRMING: 11,
    FCVIDEO_TX_PVT: 12,
    FCVIDEO_TX_GRP: 13,
    FCVIDEO_TX_KILLMODEL: 15,
    FCVIDEO_RX_IDLE: 90,
    FCVIDEO_RX_PVT: 91,
    FCVIDEO_RX_VOY: 92,
    FCVIDEO_RX_GRP: 93,
    FCVIDEO_UNKNOWN: 127
};
var MFCResponseType = {
    FCRESPONSE_SUCCESS: 0,
    FCRESPONSE_ERROR: 1,
    FCRESPONSE_NOTICE: 2
};
