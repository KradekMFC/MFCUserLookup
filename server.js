var express = require('express');
var cors = require('cors');
var request = require('request');
var MFCSocket = require('MFCSocket');
var MFCMessageType = require('MFCSocket').MFCMessageType;
var MFCResponseType = require('MFCSocket').MFCResponseType;
var UserLookup = require('MFCSocket').UserLookup;



var app = express();
app.use(cors());

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

app.get('/models', function(req, res, next){
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
        //listen for a lookup response
        socket.listen("message", function(m){
            if (!(m.Type == MFCMessageType.FCTYPE_METRICS))
                return;

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

            var url = 'http://www.myfreecams.com/mfc2/php/mobj.php?f=' + m.Data.fileno + '&s=' + server.Name;

            request(url, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    res.json({
                        message: m,
                        url: url,
                        response: body
                    });
                }
            })
        })
    });
});

app.listen(port);


