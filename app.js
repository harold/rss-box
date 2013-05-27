var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var http = require('http');
var parseXMLString = require('xml2js').parseString;

var express = require('express');
var app = express();
app.use(express.bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

var crypto = require('crypto');
var hashString = function( str ) {
	return crypto.createHash('md5').update(str).digest("hex");
}

if( !fs.existsSync('./data') )
	fs.mkdirSync('./data', 0755 );

if( !fs.existsSync('./data/feeds') )
	fs.mkdirSync('./data/feeds', 0755 );

var dir = function( path ) {
	return _.filter( fs.readdirSync(path), function(path) {
		return (!path.match(/^\./));
	});
}

var getFeed = function( url, callback ) {
	http.get(url, function( res ) {
		var resBody = "";
		res.on('data', function(data) {
			resBody += data;
		});

		res.on('end', function() {
			parseXMLString(resBody.toString(), function (err, result) {
				if( err )
					console.log("getFeed parseXMLString error: "+err);
				else
					callback(result);
			});
		});
	}).on('error', function(e){console.log("getFeed error: "+e.message);});
}

var isString = function( s ) {
	return ((typeof s).toLowerCase() == 'string' || s instanceof String);
}

var getContent = function( item ) {
	if( item["content:encoded"] && isString(item["content:encoded"][0]) )
		return item["content:encoded"][0];
	if( item.description && isString(item.description[0]) )
		return item.description[0];

	var content = "<pre>Where's this item's content?!?:\n\n"+JSON.stringify(item)+"</pre>";
	return content;
}

var getId = function( item ) {
	var id = item.guid[0];
	if( isString(id) )
		return id;
	if( isString(id._) )
		return id._;

	console.log( "\n***\n" );
	console.log( "This id ain't no string: ", id );
	console.log( "\n***\n" );
}

var processFeed = function( url ) {
	getFeed( url, function( feed ) {
		var feedId = hashString(url);
		var folder = './data/feeds/'+feedId;
		if( !fs.existsSync(folder) )
			fs.mkdirSync(folder, 0755 );
		var outFeed = {
			url: url,
			title: feed.rss.channel[0].title[0],
			link: feed.rss.channel[0].link[0],
			lastFetched: (new Date).getTime()
		};
		fs.writeFileSync(folder+"/index.json", JSON.stringify(outFeed) );

		var items = feed.rss.channel[0].item;
		items = _.map( items, function(item) {
			return {
				title: item.title[0],
				link: item.link[0],
				content: getContent(item),
				date: Date.parse(item.pubDate[0]),
				id: hashString(getId(item)),
				feedId: feedId,
				feedLink: outFeed.link,
				feedTitle: outFeed.title
			}
		});

		var itemFolder = folder+'/items';
		if( !fs.existsSync(itemFolder) )
			fs.mkdirSync(itemFolder, 0755 );

		_.each( items, function(item) {
			var itemPath = itemFolder+"/"+item.id+".json";
			if( !fs.existsSync(itemPath) )
				fs.writeFileSync(itemPath, JSON.stringify(item));
		});
	});
}

app.get('/feedlist', function(req, res) {
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each( feeds, function(feed) {
		var feedIndex = JSON.parse(fs.readFileSync(feedFolder+"/"+feed+"/index.json"));
		out.push( feedIndex.title );
	});

	res.send(JSON.stringify(out.sort()));
});

app.post('/addfeed', function(req, res) {
	var url = req.body.url;
	if( url )
		processFeed(url);
});

app.get('/readinglist', function(req, res) {
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each( feeds, function(feed) {
		var itemFolder = feedFolder+"/"+feed+"/items";
		var items = dir(itemFolder);
		_.each( items, function(item) {
			if( !fs.existsSync(feedFolder+"/"+feed+"/read/"+item) )
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
	if( !fs.existsSync(feedReadFolder) )
		fs.mkdirSync(feedReadFolder, 0755 );
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
var thirtyMinutes = 30 * msInAMinute;

var updateFeeds = function() {
	var feedFolder = "./data/feeds";
	var feeds = dir(feedFolder);
	_.each( feeds, function(feed) {
		var feedIndex = JSON.parse(fs.readFileSync(feedFolder+"/"+feed+"/index.json"));
		var currentTime = (new Date).getTime();
		var delta = currentTime - feedIndex.lastFetched;
		if( delta > 2*thirtyMinutes ) { // update at most once an hour
			console.log( "Updating: " + feedIndex.title );
			processFeed( feedIndex.url );
		}
	});
};

updateFeeds();
setInterval( function() {
	console.log( "Waking up to update feeds..." );
	updateFeeds();
}, thirtyMinutes+(10*60*1000*Math.random())); // 30 minutes + 0-10 minutes.
