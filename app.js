var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var request = require('request');
var FeedParser = require('feedparser');
var rimraf = require('rimraf');
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
		console.log("feedparser error:", error);
		if (doneCallback)
			doneCallback("ERR", error);
	});
	var fp = req.pipe(new FeedParser());
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
	rimraf.sync('./data/feeds/' + feed);
	res.send({
		status: "OK"
	});
});

app.get('/readinglist/:id?', function(req, res) {
	var id = req.params.id;
	var out = [];
	var feedFolder = "./data/feeds";
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
	out = _.sortBy(out, function(item) {
		return item.date;
	})
	res.send(out);
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
	rimraf.sync(path);
	res.send({
		status: "OK"
	});
});

var port = 3000;
app.listen(port);
console.log('Listening on port ' + port);

var msInAMinute = 1000 * 60;
var fiveMinutes = 5 * msInAMinute;
var anHour = 60 * msInAMinute;

var updateFeeds = function() {
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each(feeds, function(feed) {
		var indexPath = feedFolder + "/" + feed + "/index.json";
		if (fs.existsSync(indexPath)) {
			var feedIndex = JSON.parse(fs.readFileSync(indexPath));
			var currentTime = (new Date).getTime();
			var delta = currentTime - feedIndex.lastFetched;
			if (delta > anHour) // update at most once an hour
				processFeed(feedIndex.url);
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
}, fiveMinutes + (fiveMinutes * Math.random())); // 5 minutes + 0-5 minutes.
