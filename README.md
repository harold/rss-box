A simplest-possible web-based rss reader you can host yourself with node and dropbox.
===

### Install

 - Install [node](http://nodejs.org)
 - clone this repo into your dropbox
 - `npm install`
 - `node app.js`

### Play
 - [rss-box](http://localhost:3000)

### Keys
 - `j`/`k` next/previous item
 - `m` mark as read/unread
 - `r` refresh reading list

### Hacking

 - `npm install -g nodemon`, if you don't have nodemon yet.
 - Easy mode: `nodemon`
 - Everything is a bit dicey so far, the code functions, but its unpolished.

### TODO (in no particular order)
 - saved items
 - unread count
 - `?` key for live help
 - reorganize, refactor, and port to TypeScript
 - labels to organize feeds
