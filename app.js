var _ = require('underscore');
var path = require('path');
var fs = require('fs.extra');
var request = require('request');
var FeedParser = require('feedparser');
var cheerio = require('cheerio');
var jsuri = require('jsuri');

var express = require('express');
var app = express();
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

var crypto = require('crypto');
var hashString = function(str) {
	return crypto.createHash('md5').update(str).digest("hex");
}

var makeDir = function(path) {
	if (!fs.existsSync(path))
		fs.mkdirSync(path, 0755);
}

makeDir('./data');
makeDir('./data/feeds');

var dir = function(path) {
	return _.filter(fs.readdirSync(path), function(path) {
		return (!path.match(/^\./));
	});
}

var isString = function(s) {
	return ((typeof s).toLowerCase() == 'string' || s instanceof String);
}

var processFeed = function(url, doneCallback) {
	console.log("Updating: " + url);
	var feedId = hashString(url);
	var folder = './data/feeds/' + feedId;
	makeDir(folder);
	var newArticleCount = 0;
	var uri = new jsuri(url);
	if (!uri.protocol())
		uri.protocol("http");
	var req = request(uri.toString());
	req.on('error', function(error) {
		console.log("request error:", error);
		if (doneCallback)
			doneCallback("ERR", error);
	});
	var fp = req.pipe(new FeedParser());
	fp.on('error', function(a, b, c) {
		console.log("FeedParser error", a, b, c);
	});
	fp.on('meta', function(meta) {
		var outFeed = {
			url: url,
			title: meta.title,
			link: meta.link,
			lastFetched: (new Date).getTime()
		};
		fs.writeFileSync(folder + "/index.json", JSON.stringify(outFeed));
	});
	fp.on('article', function(article) {
		var itemFolder = folder + '/items';
		makeDir(itemFolder);
		var $ = cheerio.load(article.description || article.summary);
		$("script").remove();
		var item = {
			title: article.title,
			link: article.link,
			content: $.html(),
			date: Date.parse(article.pubDate),
			id: hashString(article.guid),
			feedId: feedId,
			feedLink: article.meta.link,
			feedTitle: article.meta.title
		}
		var itemPath = itemFolder + "/" + item.id + ".json";
		if (!fs.existsSync(itemPath)) {
			fs.writeFileSync(itemPath, JSON.stringify(item));
			newArticleCount++;
		}
	});
	fp.on('end', function() {
		if (doneCallback) {
			var feedIndex = JSON.parse(fs.readFileSync(folder + "/index.json"));
			doneCallback("OK", {
				title: feedIndex.title,
				id: feedId,
				newArticleCount: newArticleCount
			});
		}
	});
}

app.get('/feedlist', function(req, res) {
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each(feeds, function(feed) {
		var feedIndex = JSON.parse(fs.readFileSync(feedFolder + "/" + feed + "/index.json"));
		out.push({
			id: feed,
			title: feedIndex.title
		});
	});

	res.send(_.sortBy(out, function(feed) {
		return feed.title.toLowerCase()
	}));
});

app.post('/addfeed', function(req, res) {
	var url = req.body.url;
	if (url) {
		processFeed(url, function(status, obj) {
			if ("OK" == status)
				res.send(obj);
			else
				res.send(500);
		});
	}
});

app.post('/removefeed', function(req, res) {
	var feed = req.body.feedId;
	fs.rmrfSync('./data/feeds/' + feed);
	res.send({
		status: "OK"
	});
});

app.get('/readinglist/:id?', function(req, res) {
	var id = req.params.id;
	var out = [];
	var feedFolder = "./data/feeds";
	if ("saved" == id) {
		var feeds = dir(feedFolder);
		_.each(feeds, function(feed) {
			var savedFolder = feedFolder + "/" + feed + "/saved";
			if (fs.existsSync(savedFolder)) {
				var items = dir(savedFolder);
				_.each(items, function(item) {
					out.push(JSON.parse(fs.readFileSync(savedFolder + "/" + item)));
				});
			}
		});
	} else {
		var feeds = id ? [id] : dir(feedFolder);
		_.each(feeds, function(feed) {
			var itemFolder = feedFolder + "/" + feed + "/items";
			if (fs.existsSync(itemFolder)) {
				var items = dir(itemFolder);
				_.each(items, function(item) {
					if (id || !fs.existsSync(feedFolder + "/" + feed + "/read/" + item))
						out.push(JSON.parse(fs.readFileSync(itemFolder + "/" + item)));
				});
			} else {
				console.log("Missing items folder:", itemFolder);
			}
		});
	}
	out = _.sortBy(out, function(item) {
		return item.date;
	})
	res.send(out);
});

app.post('/saveitem', function(req, res) {
	var feedId = req.body.feedId;
	var itemId = req.body.itemId;
	var feedFolder = "./data/feeds/" + feedId;
	var feedItemFolder = feedFolder + "/items"
	var feedSavedFolder = feedFolder + "/saved";
	makeDir(feedSavedFolder);
	var src = feedItemFolder + "/" + itemId + ".json";
	var dst = feedSavedFolder + "/" + itemId + ".json";
	if (fs.existsSync(src) && !fs.existsSync(dst)) {
		fs.copy(src, dst, function(err) {
			if (err)
				throw err;
			else
				res.send({
					status: "OK"
				});
		});
	} else {
		res.send({
			status: "ALREADY SAVED"
		});
	}
});

app.post('/markasread', function(req, res) {
	var feedId = req.body.feedId;
	var itemId = req.body.itemId;
	var feedReadFolder = "./data/feeds/" + feedId + "/read";
	makeDir(feedReadFolder);
	var path = feedReadFolder + "/" + itemId + ".json";
	if (!fs.existsSync(path)) {
		var path = path;
		var contents = {
			readTime: (new Date).getTime()
		};
		fs.writeFileSync(path, contents);
	}
	res.send({
		status: "OK"
	});
});

app.post('/markasunread', function(req, res) {
	var feedId = req.body.feedId;
	var itemId = req.body.itemId;
	var path = "./data/feeds/" + feedId + "/read/" + itemId + ".json";
	fs.rmrfSync(path);
	res.send({
		status: "OK"
	});
});

var port = 3000;
app.listen(port);
console.log('Listening on port ' + port);

var msInAMinute = 1000 * 60;
var fiveMinutes = 5 * msInAMinute;
var halfHour = 30 * msInAMinute;

var updateFeeds = function() {
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each(feeds, function(feed) {
		var indexPath = feedFolder + "/" + feed + "/index.json";
		if (fs.existsSync(indexPath)) {
			var feedIndex = JSON.parse(fs.readFileSync(indexPath));
			var currentTime = (new Date).getTime();
			var delta = currentTime - feedIndex.lastFetched;
			var retried = false;
			if (delta > halfHour) // update at most every half an hour
				processFeed(feedIndex.url, function(obj) {
					if (obj === "ERR" && !retried) {
						retried = true;
						setTimeout(function() {
							console.log("retrying:", feedIndex.url);
							processFeed(feedIndex.url);
						}, 3000); // wait 3 seconds and try again.
					}
				});
		} else {
			try {
				fs.rmdirSync(feedFolder + "/" + feed);
			} catch (err) {
				console.log("udpateFeeds error:", err);
			}
		}
	});
};

updateFeeds();
setInterval(function() {
	console.log("Waking up to update feeds... (" + (new Date) + ")");
	updateFeeds();
}, msInAMinute + (msInAMinute * Math.random())); // 1 minute + 0-1 minutes.
