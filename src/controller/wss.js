"use strict";

var fs = require('fs');
var path = require('path');
var mpdClient = require("./mpdclient.js");
var debug = require('debug')('mpd.fm:wss');
const WebSocket = require('ws');
const mongo = require('mongodb').MongoClient
let url = 'mongodb://@localhost:27017/radio?socketTimeoutMS=90000';
const collectionName = 'stations'

function sendWSSMessage(client, type, data, showDebug = true) {
    data = objectToLowerCase(data);
    showDebug && debug('Send: ' + type + ' with %o', data);
    var msg = {
        type: type,
        data: (data) ? data : {}
    }
    client.send(JSON.stringify(msg), function (error) {
        if (error)
            debug('Failed to send data to client %o', error);
    });
}

function broadcastMessage(server, type, data) {
    data = objectToLowerCase(data);
    debug('Broadcast: ' + type + ' with %o', data);
    server.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            sendWSSMessage(client, type, data, false);
        }
    });
}

function objectToLowerCase(data) {
    if (!data) {
        return data;
    } else if (Array.isArray(data)) {
        return data.map(value => objectToLowerCase(value));
    } else if (typeof data === 'object') {
        var retData = {};
        for (const [key, value] of Object.entries(data)) {
            retData[key.toLowerCase()] = objectToLowerCase(value);
        }
        return retData;
    } else {
        return data;
    }
}

module.exports = {
    init: function (wss) {
        wss.on('connection', function connection(ws, req) {
            ws.on('message', function incoming(message) {

                var msg = JSON.parse(message);
                debug('Received %s with %o', msg.type, msg.data);
                switch (msg.type) {
                    case "REQUEST_STATION_LIST":

                        mongo.connect(url, (err, client) => {
                            if (err) {
                                console.error('Can\'t connect to database: "' + err);
                                return
                            }
                            console.error(client);
                            const collection = client.collection(collectionName)

                            collection.find().toArray((error, items) => {
                                if (error) {
                                    console.error('Can\'t find stations from collection: "' + error);
                                    return
                                }
                                console.log(items)
                                sendWSSMessage(ws, 'STATION_LIST', items);
                            })
                        })
                        break;

                    case "REQUEST_STATUS":
                        mpdClient.getMpdStatus(function (err, status) {
                            if (err) {
                                sendWSSMessage(ws, 'MPD_OFFLINE', null);
                            } else {
                                sendWSSMessage(ws, 'STATUS', status);
                            }
                        });
                        break;

                    case "REQUEST_ELAPSED":
                        mpdClient.getElapsed(function (err, elapsed) {
                            if (err) {
                                sendWSSMessage(ws, 'MPD_OFFLINE', null);
                            } else {
                                sendWSSMessage(ws, 'ELAPSED', elapsed);
                            }
                        });
                        break;
                    case "ADD":
                        if (msg.data && msg.data.station) {
                            mongo.connect(url, (err, client) => {
                                if (err) {
                                    console.error('Can\'t connect to database: "' + err);
                                    return
                                }
                                const collection = client.collection(collectionName)

                                collection.insertOne(msg.data.station, (err, result) => {
                                    if(err) throw err;
                                    console.log(result);
                                    sendWSSMessage(ws, 'ADDED');
                                })
                            })
                        } 
                        break;
                    case "PLAY":
                        if (msg.data && msg.data.stream) {

                            console.log(msg.data.stream);

                            mongo.connect(url, (err, client) => {
                                if (err) {
                                    console.error('Can\'t connect to database: "' + err);
                                    return
                                }
                                console.error(client);
                                const collection = client.collection(collectionName)
                                let dataFalse = { $set : {playing : false }}

                                collection.updateMany({}, dataFalse, (err, collection) => {
                                    if(err) throw err;
                                    console.log(collection.result.nModified + " Record(s) updated successfully");
                                })

                                let query = { stream : msg.data.stream };
                                let dataTrue = { $set : {playing : true }}

                                collection.updateMany(query, dataTrue, (err, collection) => {
                                    if(err) throw err;
                                    console.log(collection.result.nModified + " Record(s) updated successfully");
                                    console.log(collection);
                                    mpdClient.playStation(msg.data.stream, function (err) {
                                        if (err) {
                                            sendWSSMessage(ws, 'MPD_OFFLINE');
                                        }
                                    });
                                })
                            })
                        } else {
                            mpdClient.play(function (err) {
                                if (err) {
                                    sendWSSMessage(ws, 'MPD_OFFLINE');
                                }
                            });
                        }
                        break;

                    case "PAUSE":
                        mpdClient.pause(function (err) {
                            if (err) {
                                sendWSSMessage(ws, 'MPD_OFFLINE');
                            }
                        });
                        break;
                }

            });

        });

        mpdClient.onStatusChange(function (status) {
            broadcastMessage(wss, 'STATUS', status);
        });
    }
};