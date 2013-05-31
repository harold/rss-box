var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var request = require('request');
var FeedParser = require('feedparser');
var rimraf = require('rimraf');
var cheerio = require('cheerio');

var express = require('express');
var app = express();
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

var crypto = require('crypto');
var hashString = function( str ) {
	return crypto.createHash('md5').update(str).digest("hex");
}

var makeDir = function( path ) {
	if( !fs.existsSync(path) )
		fs.mkdirSync(path, 0755 );
}

makeDir( './data' );
makeDir( './data/feeds' );

var dir = function( path ) {
	return _.filter( fs.readdirSync(path), function(path) {
		return (!path.match(/^\./));
	});
}

var isString = function( s ) {
	return ((typeof s).toLowerCase() == 'string' || s instanceof String);
}

var processFeed = function( url ) {
	console.log( "Updating: " + url );
	var feedId = hashString(url);
	var folder = './data/feeds/'+feedId;
	makeDir( folder );
	request(url).pipe(new FeedParser())
	.on('error', function(error) { console.log("feedparser error:", error); })
	.on('meta', function (meta) {
		var outFeed = {
			url: url,
			title: meta.title,
			link: meta.link,
			lastFetched: (new Date).getTime()
		};
		fs.writeFileSync(folder+"/index.json", JSON.stringify(outFeed) );
	})
	.on('article', function (article) {
		var itemFolder = folder+'/items';
		makeDir( itemFolder );
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
		var itemPath = itemFolder+"/"+item.id+".json";
		if( !fs.existsSync(itemPath) )
			fs.writeFileSync(itemPath, JSON.stringify(item));
	});
}

app.get('/feedlist', function(req, res) {
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each( feeds, function(feed) {
		var feedIndex = JSON.parse(fs.readFileSync(feedFolder+"/"+feed+"/index.json"));
		out.push( {id:feed, title:feedIndex.title} );
	});

	res.send(JSON.stringify(_.sortBy(out, function(feed){return feed.title.toLowerCase()})));
});

app.post('/addfeed', function(req, res) {
	var url = req.body.url;
	if( url )
		processFeed(url);
});

app.post('/removefeed', function(req, res) {
	var feed = req.body.feedId;
	rimraf.sync('./data/feeds/'+feed);
	res.send(JSON.stringify({status:"OK"}));
});

app.get('/readinglist/:id?', function(req, res) {
	var id = req.params.id;
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = id ? [ id ] : dir(feedFolder);
	_.each( feeds, function(feed) {
		var itemFolder = feedFolder+"/"+feed+"/items";
		var items = dir(itemFolder);
		_.each( items, function(item) {
			if( id || !fs.existsSync(feedFolder+"/"+feed+"/read/"+item) )
				out.push(JSON.parse(fs.readFileSync(itemFolder+"/"+item)));
		});
	});
	out = _.sortBy( out, function(item) {
		return item.date;
	})
	res.send(JSON.stringify(out));
});

app.post('/markasread', function(req, res) {
	var feedReadFolder = "./data/feeds/"+req.body.feedId+"/read";
	makeDir( feedReadFolder );
	if( !fs.existsSync(feedReadFolder+"/"+req.body.id+".json") ) {
		var path = feedReadFolder+"/"+req.body.id+".json";
		var contents = JSON.stringify({readTime: (new Date).getTime()});
		fs.writeFileSync(path, contents);
	}
	res.send(JSON.stringify({status:"OK"}));
});

var port = 3000;
app.listen(port);
console.log('Listening on port '+port);

var msInAMinute = 1000*60;
var fiveMinutes = 5 * msInAMinute;
var anHour = 60 * msInAMinute;

var updateFeeds = function() {
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each( feeds, function(feed) {
		var feedIndex = JSON.parse(fs.readFileSync(feedFolder+"/"+feed+"/index.json"));
		var currentTime = (new Date).getTime();
		var delta = currentTime - feedIndex.lastFetched;
		if( delta > anHour ) // update at most once an hour
			processFeed( feedIndex.url );
	});
};

updateFeeds();
setInterval( function() {
	console.log( "Waking up to update feeds... ("+(new Date)+")" );
	updateFeeds();
}, fiveMinutes+(fiveMinutes*Math.random())); // 5 minutes + 0-5 minutes.
