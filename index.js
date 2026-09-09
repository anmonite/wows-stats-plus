require('dotenv').load();
const express 	= require('express');
const bodyParser 	= require('body-parser');
const request 	= require('request');
const fs			= require('fs');
const jsonfile 	= require('jsonfile');

var app = express();
var port = process.env.PORT || 8080;
var api_key = process.env.WOWS_API_KEY || "demo";
var capture_flag = process.env.NODE_CAPTURE;
if (capture_flag === 'true') {
	capture_flag = true;
} else if (capture_flag === 'false') {
	capture_flag = false;
} else {
	capture_flag = true;
}

// create application/json parser
var jsonParser = bodyParser.json({limit:'10mb'});

// Get latest seasons(rank battle) number
/* var latest_season_num = 0;


function get_season_num() {
	request(process.env.WOWS_API_URL + '/wows/seasons/info/?application_id=' + api_key, function (error, response, body) {
		if ((!error && response.statusCode == 200) || (!error && response.statusCode == 304)) {
			var json = JSON.parse(body);
			if (json.status == "ok") {
				if (json.meta.count >= 0) {
					latest_season_num = json.meta.count;
					console.log('latest season number of rank battle = ' + latest_season_num);
				}
			}
		}
	});
}
get_season_num();
*/

function update_PRexpectedJSON() {
	var req_options = {
		url: 'https://moon-light-oasis.net/wp-content/uploads/xvm_files/expected.json',
		/*https://asia.wows-numbers.com/ja/personal/rating/expected/json/*/
		method: 'GET',
		json: true
	}
	request(req_options, function (error, response, body) {
		if ((!error && response.statusCode == 200) || (!error && response.statusCode == 304)) {
			console.log('Got expected json file for PR.');

			if (body.data != null) {
				fs.writeFile('static/js/expected.json', JSON.stringify(body, null, '	'), (err) => {
					if (!err) {
						console.log('Download & Overwrite completed as \'./static/js/expected.json\'.');

						// copy json file as a stable
						fs.copyFileSync('static/js/expected.json', 'static/js/expected_stable.json');
						console.log('Success copy to \'expected_stable.json\'.');
					} else {
						console.log("Overwrite error './static/js/expected.json'. : %s", err);

						// rollback expected.json from stable one
						fs.copyFileSync('static/js/expected_stable.json', 'static/js/expected.json');
						console.log('Success replace expected json file from stable one.');
					}
				});
			} else {
				console.log('empty expected list');

				// rollback expected.json from stable one
				fs.copyFileSync('static/js/expected_stable.json', 'static/js/expected.json');
				console.log('Success replace expected json file from stable one.');
			}
		} else {
			console.log('Error getting expected data.');

			// rollback expected.json from stable one
			fs.copyFileSync('static/js/expected_stable.json', 'static/js/expected.json');
			console.log('Success replace expected json file from stable one.');
		}
	});
}
update_PRexpectedJSON();

// static endpoint
app.use(express.static(__dirname + '/static'));

// api endpoint
var router = express.Router();
app.use('/api', router);

router.get('/', function(req, res) {
	res.json({
		status: "ok",
		name: "wows-stats-plus api",
		version: "v2"
	});
});

router.get('/env', function(req, res) {
	var env = {};
	if (process.env.WOWS_PATH)
		env.PATH = process.env.WOWS_PATH;
	if (process.env.WOWS_API_URL)
		env.API_URL = process.env.WOWS_API_URL;
	env.API_KEY = api_key;
	env.CAPTURE_FLAG = capture_flag;
	env.status = "ok";

	res.json(env);
});

// Proxy batch requests through the local server because the Wargaming API
// does not allow cross-origin browser requests from localhost.
function proxyWowsApi(res, path) {
	request(process.env.WOWS_API_URL + path, function(error, response, body) {
		if (error) {
			return res.status(502).json({
				status: 'error',
				error: { message: error.message }
			});
		}

		res.status(response.statusCode);
		res.type('application/json');
		return res.send(body);
	});
}

router.get('/shipinfo', function(req, res) {
	if (!req.query.ship_id || !/^\d+(,\d+)*$/.test(req.query.ship_id))
		return res.sendStatus(400);

	proxyWowsApi(res, '/wows/encyclopedia/ships/?application_id=' + api_key +
		'&fields=name%2Ctier%2Ctype%2Cnation&language=en&ship_id=' +
		encodeURIComponent(req.query.ship_id));
});

router.get('/accountlist', function(req, res) {
	if (!req.query.search || req.query.search.length > 2000)
		return res.sendStatus(400);

	proxyWowsApi(res, '/wows/account/list/?application_id=' + api_key +
		'&search=' + encodeURIComponent(req.query.search) + '&type=exact');
});

router.get('/claninfo', function(req, res) {
	if (!req.query.account_id || !/^\d+(,\d+)*$/.test(req.query.account_id))
		return res.sendStatus(400);

	proxyWowsApi(res, '/wows/clans/accountinfo/?application_id=' + api_key +
		'&account_id=' + encodeURIComponent(req.query.account_id) + '&extra=clan');
});

router.post('/path', jsonParser, function(req, res) {
	if (req.body.path) {
		fs.access(req.body.path + "/WorldOfWarships.exe", fs.R_OK, function (err) {
			if (!err)
				res.sendStatus(200);
			else
				res.sendStatus(404);
		});
	}
	else
		res.sendStatus(400);
});


router.post('/config', jsonParser, function(req, res) {
	if (req.body.action) {
		if (req.body.action == "cancel") {
			res.sendStatus(200);
			console.log("User cancelled wows-stats-plus configlation.")
			process.exit(1);
		}
		else if(req.body.action == "save") {

			var validation = {};

			validation.checkPath = function() {
				if (req.body.path) {
					fs.access(req.body.path + "/WorldOfWarships.exe", fs.R_OK, function (err) {
						if (err)
							return res.status(400).send("World Of Warships application is not found.");
						else 
							validation.checkKey();
					});
				}
				else
					return res.sendStatus(400);
			}

			validation.checkKey = function() {
				if (req.body.key) {
					request(req.body.url + '/wows/encyclopedia/info/?application_id=' + req.body.key, function (error, response, body) {
						if (!error && response.statusCode == 200) {
							var data = JSON.parse(body);
							if (data.status == 'ok')
								return validation.save();
							else
								return res.status(400).send(data.error.message);
						}
						else
							return res.status(response.statusCode).send(error);
					});
				}
				else
					return validation.save();
			}

			validation.save = function() {
				fs.writeFile('.env', 
					'WOWS_PATH="' + req.body.path + '"\n' +
					'WOWS_API_URL="' + req.body.url + '"\n' + 
					(req.body.key ? ('WOWS_API_KEY=' + req.body.key):''),
					function (err) {
					  	if (!err) {
					  		res.sendStatus(200);
					  		process.exit(0);
					  		return;
					  	}
					  	else {
					  		console.log(err);
					  		return res.sendStatus(500);
					  	}
				});
			}

			validation.checkPath();
		}
	}
	else
		res.sendStatus(400);
});

// Save json file to local storage on this PC
router.post('/save_json', jsonParser, function(req, res) {
	const fsPromises = fs.promises;
	fsPromises.writeFile('static/' + req.get('File-Path'), JSON.stringify(req.body, null, ""))
		.then(() => {
			res.send('done.')
		})
		.catch((err) => {
			res.status(500).send(err);
		})
});


// player api
router.get('/player', jsonParser, function(req, res) {
	if (req.query.name) {
		// except co-op & scenario bot ships
		var reg1 = new RegExp(/^:\w+:$/);
		var reg2 = new RegExp(/^IDS_OP_\w+$/);
		if ((reg1.test(req.query.name) == false) && (reg2.test(req.query.name) == false)) {
//			console.log(req.query.name);

			// search and get account_id
			request(process.env.WOWS_API_URL + '/wows/account/list/?application_id=' + api_key + '&search=' + encodeURIComponent(req.query.name), function (error, response, body) {
				if ((!error && response.statusCode == 200) || (!error && response.statusCode == 304)) {
					var json = JSON.parse(body);
					if (json.status == "ok") {
						if (json.meta.count >= 0) {
							var player = {};
							var playerJson = null;
							for (var i=0; i<json.meta.count; i++) {
								if (json.data[i].nickname == decodeURIComponent(req.query.name)) {
									playerJson = json.data[i];
									break;
								}
							}
							if (playerJson) {
								player.id = playerJson.account_id.toString();
								player.name = playerJson.nickname;
								player.pre_rank = '**';
								player.rank = '**';
								player.clan = '';

								// get player info
								request(process.env.WOWS_API_URL + '/wows/account/info/?application_id=' + api_key + '&account_id=' + player.id, function (err, rep, statsBody) {
									if ((!err && rep.statusCode == 200) || (!err && rep.statusCode == 304)) {
										var stats = JSON.parse(statsBody);
										if (stats.status == "ok") {
											if (stats.data[player.id] != null) {
												stats = stats.data[player.id];
												if (stats.statistics != null) {
													player.battles 	= stats.statistics.pvp.battles;
													player.winRate 	= (stats.statistics.pvp.wins / stats.statistics.pvp.battles * 100).toFixed(2) + "%";
													player.avgExp	= (stats.statistics.pvp.xp / stats.statistics.pvp.battles).toFixed();
													player.avgDmg	= (stats.statistics.pvp.damage_dealt / stats.statistics.pvp.battles).toFixed();
													player.kdRatio	= (stats.statistics.pvp.frags / (stats.statistics.pvp.battles - stats.statistics.pvp.survived_battles)).toFixed(2);
													player.raw 		= stats;

													// get player clan info
													request(process.env.WOWS_API_URL + '/wows/clans/accountinfo/?application_id=' + api_key + '&account_id=' + player.id + '&extra=clan', function (cl_error, cl_response, clanBody) {
														if ((!cl_error && cl_response.statusCode == 200) || (!cl_error && cl_response.statusCode == 304)) {
															var clanInfo = JSON.parse(clanBody);
															if (clanInfo.status == "ok") {
//																console.log(clanInfo.data);

																if ((clanInfo.data[player.id] != null) && (clanInfo.data[player.id]['clan'] != null)) {
																	var cstat = clanInfo.data[player.id];
																	player.clan_id = cstat['clan']['clan_id'];
																	player.clan = '[' + cstat['clan']['tag'] + ']';
//																	console.log("%s : %s", player.name, player.clan);
																} else {
																	player.clan_id = '';
																	player.clan = '';
//																	console.log('null clan info data');
																}

																// get player rank battle info
																player.rank = '**';
																player.pre_rank = '**';
																res.json(player);
																/*
																request(process.env.WOWS_API_URL + '/wows/seasons/accountinfo/?application_id=' + api_key + '&account_id=' + player.id + '&season_id=' + (latest_season_num -1) + '%2C' + latest_season_num, function (rk_error, rk_response, rankBody) {
																	if ((!rk_error && rk_response.statusCode == 200) || (!rk_error && rk_response.statusCode == 304)) {
																		var seasons = JSON.parse(rankBody);
																		if (seasons.status == "ok") {
																			if (seasons.data != null) {
																				if (seasons.data[player.id] != null) {
																					var rstat = seasons.data[player.id];

																					var pre_season = rstat.seasons[(latest_season_num -1)];
																					if (pre_season != null) {
																						if (pre_season.rank_info != null) {

																							player.pre_rank = pre_season.rank_info.max_rank;
//																							console.log(player.pre_rank);
																							if (pre_season.rank_info.max_rank == 0)
																								player.pre_rank = '**';
																						} else {
																							player.pre_rank = '**';
//																							console.log('null pre rank info data');
																						}
																					} else {
																						player.pre_rank = '**';
//																						console.log('null pre rank info data');
																					}

																					var season = rstat.seasons[latest_season_num];
																					if (season != null) {
																						if (season.rank_info != null) {

																							player.rank = season.rank_info.max_rank;
//																							console.log(player.rank);
																							if (season.rank_info.max_rank == 0)
																								player.rank = '**';
																						} else {
																							player.rank = '**';
//																							console.log('null rank info data');
																						}
																					} else {
																						player.rank = '**';
//																						console.log('null rank info data');
																					}
																				} else {
																					player.pre_rank = '**';
																					player.rank = '**';
//																					console.log('null rank info data');
																				}
																			} else {
																				player.pre_rank = '**';
																				player.rank = '**';
//																				console.log('null rank info data');
																			}

																			res.json(player);
																		} else {
//																			console.log('getting rank info status failed');
																			res.status(400).send(json.error);
																		}
																	}
																	else if(rk_response)
																		res.status(rk_response.statusCode);
																	else
																		res.status(500);
																});
																*/
															} else {
//																console.log('getting clan info failed');
																res.status(400).send(json.error);
															}
														}
														else if(cl_response)
															res.status(cl_response.statusCode);
														else
															res.status(500);
													});
												}
												else
													res.status(401).send(player);
											}
											else
												res.status(500).send(player);
										}
										else
											res.status(400).send(player);
									}
									else if(rep)
										res.status(rep.statusCode).send(player);
									else
										res.status(500).send(player);
								});
							}
							else
								res.sendStatus(404);
						}
						else
							res.sendStatus(404);
					}
					else
						res.status(400).send(json.error);
				}
				else if(response) {
					res.sendStatus(response.statusCode);
				} else {
					res.sendStatus(500);
				}
			});
		}
		else
			res.sendStatus(400);
	}
	else
		res.sendStatus(400);
});

// ship api
router.get('/ship', jsonParser, function(req, res) {
	if (req.query.playerId && req.query.shipId) {
		request(process.env.WOWS_API_URL + '/wows/encyclopedia/ships/?application_id=' + api_key + '&ship_id=' + req.query.shipId + '&language=en', function (err, rep, infoBody) {
			if ((!err && rep.statusCode == 200) || (!err && rep.statusCode == 304)) {
				var info = JSON.parse(infoBody);
				if (info.status == "ok") {
					if (info.data[req.query.shipId] != null) {
						var ship = {};
						info = info.data[req.query.shipId];
						ship.name = info.name;
						ship.img = info.images.small;
						ship.info = info;
						request(process.env.WOWS_API_URL + '/wows/ships/stats/?application_id=' + api_key + '&account_id=' + req.query.playerId + '&ship_id=' + req.query.shipId, function (error, response, body) {
							if ((!error && response.statusCode == 200) || (!error && response.statusCode == 304)) {
								var json = JSON.parse(body);
								if (json.status == "ok") {
									if (json.data[req.query.playerId] != null) {
										var stats = json.data[req.query.playerId][0];
										ship.id = 			stats.ship_id;
										ship.battles = 		stats.pvp.battles;
										ship.victories = 	stats.pvp.wins;
										ship.survived = 	stats.pvp.survived_battles;
										ship.destroyed = 	stats.pvp.frags;
										ship.avgExp =  		(stats.pvp.xp / stats.pvp.battles).toFixed();
										ship.avgDmg =  		(stats.pvp.damage_dealt / stats.pvp.battles).toFixed();
										ship.raw = 			stats;
										if (stats.pvp.battles == 0)
											ship.noRecord = true;
										res.json(ship);
									}
									else {
										ship.id = req.query.shipId;
										ship.noRecord =	true;
										res.json(ship);
									}
								}
								else
									res.status(400).send(json.error);
							}
							else if(response) {
								res.sendStatus(response.statusCode);
							} else {
								res.sendStatus(500);
							}
						});
					}
					else
						res.sendStatus(404);
				}
				else
					res.status(400).send(info.error);
			}
			else if(rep)
				res.sendStatus(rep.statusCode);
			else
				res.sendStatus(500);
		});
	}
	else
		res.sendStatus(400);
});

// arena api
router.get('/arena', jsonParser, function(req, res) {
	var fname = process.argv[2];
	var freg = new RegExp(/^\d{8}_\d{6}_\w{4}\d{3}-.+$/);
	var arg_mode = false;
	var arenaJson = '';

	if ((fname != '') && freg.test(fname)) {
		arenaJson = process.env.WOWS_PATH + '/replays/' + fname + '.wowsreplay';
		arg_mode = true;
	} else {
		arenaJson = process.env.WOWS_PATH + '/replays/tempArenaInfo.json';
		arg_mode = false;
	}

//	console.log('argv: ' + fname);
//	console.log('read file: ' + arenaJson);

	if ((process.platform == 'win32') || (process.platform == 'darwin')) {
		fs.access(arenaJson, fs.R_OK, function (err) {
			if (!err) {
				if (arg_mode) {
					fs.readFile(arenaJson, function read(error, obj) {
					    if (!error) {
							var buffer = Buffer.from(obj, 'binary');
							var start_pos = 12;
							var end_pos = buffer[9]*256 + buffer[8] + 12;
//							console.log("%s%s %d", buffer[9].toString(16), buffer[8].toString(16), end_pos);
							var data = '';
							for(var p=start_pos; p < end_pos; p++) {
								data += String.fromCharCode(buffer[p]);
							}
//							console.log('data: %s', data);
							var jsondata = JSON.parse(data);
//							console.log('read file: %s', arenaJson);
//							console.log(jsondata);
			   				res.json(jsondata);
			    		}
					    else {
					    	res.sendStatus(404);
					    }
					});
				} else {
					jsonfile.readFile(arenaJson, function read(error, obj) {
					    if (!error) {
//							console.log('read file: %s', arenaJson);
//							console.log('jsondata: ' + obj);
				    		res.json(obj);
					    }
					    else {
					    	res.sendStatus(404);
					    }
					});
				}
			}
			else {
				res.sendStatus(404);
			}
		});
	}
	else
		res.sendStatus(400);
});

app.listen(port);
console.log('wows-stats-plus is running on port: ' + port);

process.stdin.resume();
process.stdin.setEncoding('utf8');

process.on('SIGINT', function() {
    console.log('process terminated by Ctrl+C.');
    process.exit(0);
});
