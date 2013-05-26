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
	fs.mkdir('./data', 0755 );

if( !fs.existsSync('./data/feeds') )
	fs.mkdir('./data/feeds', 0755 );

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
		var urlHash = hashString(url);
		var folder = './data/feeds/'+urlHash;
		if( !fs.existsSync(folder) )
			fs.mkdir(folder, 0755 );
		var outFeed = {
			url: url,
			title: feed.rss.channel[0].title[0],
			link: feed.rss.channel[0].link[0],
			lastFetched: (new Date).getTime()
		};
		fs.writeFile(folder+"/index.json", JSON.stringify(outFeed) );

		var items = feed.rss.channel[0].item;
		items = _.map( items, function(item) {
			return {
				title: item.title[0],
				link: item.link[0],
				content: getContent(item),
				date: Date.parse(item.pubDate[0]),
				id: hashString(getId(item)),
				feedLink: outFeed.link,
				feedTitle: outFeed.title
			}
		});

		var itemFolder = folder+'/items';
		if( !fs.existsSync(itemFolder) )
			fs.mkdir(itemFolder, 0755 );

		_.each( items, function(item) {
			var itemPath = itemFolder+"/"+item.id+".json";
			if( !fs.existsSync(itemPath) )
				fs.writeFile(itemPath, JSON.stringify(item));
		});
	});
}

app.get('/feedlist', function(req, res) {
	var out = [];
	var feedFolder = "./data/feeds";
	var feeds = fs.readdirSync(feedFolder);
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
	var feeds = fs.readdirSync(feedFolder);
	_.each( feeds, function(feed) {
		var itemFolder = feedFolder+"/"+feed+"/items";
		var items = fs.readdirSync(itemFolder);
		_.each( items, function(item) {
			out.push(JSON.parse(fs.readFileSync(itemFolder+"/"+item)));
		});
	});
	out = _.sortBy( out, function(item) {
		return item.date;
	})
	res.send(JSON.stringify(out));
});

var port = 3000;
app.listen(port);
console.log('Listening on port '+port);

var msInAMinute = 1000*60;
var thirtyMinutes = 30 * msInAMinute;

//setInterval( function() {
//	console.log("WHEE");
//}, thirtyMinutes);

//var feedFolder = "./data/feeds";
//var feeds = fs.readdirSync(feedFolder);
//_.each( feeds, function(feed) {
//	var feedIndex = JSON.parse(fs.readFileSync(feedFolder+"/"+feed+"/index.json"));
//	console.log( feedIndex.url );
//	processFeed( feedIndex.url );
//});
