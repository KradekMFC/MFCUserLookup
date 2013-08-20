var express = require('express');
var MFCSocket = require('MFCSocket');
var MFCMessageType = require('MFCSocket').MFCMessageType;
var MFCResponseType = require('MFCSocket').MFCResponseType;
var UserLookup = require('MFCSocket').UserLookup;

var app = express();

var port = process.env.PORT || 1337;

app.get('/', function(req, res, next) {
    //leave if there is no username
    if (!req.query.username)
        res.json({error:"No username provided."});

    //create a socket to do the lookup
    var socket = new MFCSocket();

    //listen for socket errors
    socket.listen("error", function(err){
        res.json({error: "A socket error occurred.", detail: err});
    });

    //listen for the socket closing
    socket.listen("close", function(msg){
        res.json({error: "Socket closed unexpectedly.", detail: msg});
    })

    //set up a listener for login completion
    socket.listen("loggedin", function(e){
        //send the lookup
        socket.send(new UserLookup(req.query.username));
        //listen for a lookup response
        socket.listen("message", function(m){
            //leave if the message isn't a userlookup response
            if (!(m.Type == MFCMessageType.FCTYPE_USERNAMELOOKUP))
                return;
            //return an error if MFC returned one
            if (m.Arg2 == MFCResponseType.FCRESPONSE_ERROR)
                res.json({error: "User does not exist or MFC error.", detail: m})

            //return the data package on a successful response
            res.json(m.Data);
        })
    });
});

app.listen(port);


