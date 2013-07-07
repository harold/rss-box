var _el = function(s) {
	return document.createElement(s)
};

var log = function(html) {
	var l = $(_el("div")).html(html).prependTo($("#log-area"));
	setTimeout(function() {
		l.slideUp();
	}, 1000);
}

var ReadingList = (function() {
	function ReadingList() {
		this.elt = $("<div/>");
		$("#main").append(this.elt);
		this.refresh();

		var _this = this;
		$(window).keypress(function(e) {
			if (106 == e.which) // j
				_this.move(1);
			if (107 == e.which) // k
				_this.move(-1);
			if (114 == e.which) // r
				_this.refresh();
			if (109 == e.which) // r
				_this.toggleRead();
			if (115 == e.which) // s
				_this.saveItem();
			if (83 == e.which) // S
				_this.refresh("saved");
		});
	}
	ReadingList.prototype.saveItem = function() {
		var item = this.list[this.index];
		if (!item)
			return;
		var promise = $.post('/saveitem', {
			feedId: item.feedId,
			itemId: item.id
		});
		promise.done(function(response) {
			if ("OK" == response.status) {
				var elt = item.elt.find(".item-footer");
				var oldHTML = elt.html();
				elt.html(oldHTML + " <strong>SAVED</strong>");
			}
		})
	};
	ReadingList.prototype.toggleRead = function() {
		var item = this.list[this.index];
		if (!item.unread)
			this.markAsUnread(item);
		else
			this.markAsRead(item);
	};
	ReadingList.prototype.refresh = function(id) {
		var _this = this;
		this.index = -1;
		this.elt.empty();
		var path = "/readinglist" + (id ? "/" + id : "");
		$.getJSON(path, function(items) {
			_this.list = items;
			_this.elt.empty();
			_.each(items, function(item) {
				item.elt = _this.createEltFromItem(item);
				_this.elt.append(item.elt);
			});

			if (0 == _this.list.length)
				_this.elt.append("No unread items. You can add more feeds using that menu in the top right corner &rarr;");

			log("Reading list refreshed, <strong>" + _this.list.length + "</strong> unread items.");
		});
	};
	ReadingList.prototype.toggleByIndex = function(index) {
		if (index >= 0 && index < this.list.length) {
			$(this.list[index].elt).children(".full-item, .one-line-item").toggle();
		}
	};
	ReadingList.prototype.move = function(delta) {
		var newIndex = this.index + delta;
		newIndex = Math.max(newIndex, 0);
		newIndex = Math.min(newIndex, this.list.length - 1);
		if (newIndex != this.index) {
			this.toggleByIndex(this.index);
			this.index = newIndex;
			this.toggleByIndex(newIndex);
			var item = this.list[newIndex];
			$(window).scrollTop(item.elt.offset().top);
			this.markAsRead(item);
		}
	};
	ReadingList.prototype.markAsRead = function(item) {
		delete item.unread;
		var promise = $.post('/markasread', {
			feedId: item.feedId,
			itemId: item.id
		});
		promise.done(function(response) {
			if ("OK" == response.status)
				item.elt.find(".item-footer").html("This item is read.");
		});
	};
	ReadingList.prototype.markAsUnread = function(item) {
		item.unread = true;
		var promise = $.post('/markasunread', {
			feedId: item.feedId,
			itemId: item.id
		});
		promise.done(function(response) {
			if ("OK" == response.status)
				item.elt.find(".item-footer").html("This item is <strong>un</strong>-read.");
		});
	};
	ReadingList.prototype.createEltFromItem = function(item) {
		var _this = this;
		var template = _.template($.trim("\
			<div class='item'>\
			<div class='one-line-item'>\
			<div class='one-line-feed'><%= feedTitle %></div>\
			<%= title %>\
			</div>\
			<div class='full-item'>\
			<h2><a href='<%= link %>'><%= title %></a></h2>\
			<div class='feed-title'>\
			from <a href='<%= feedLink %>'><%= feedTitle %></a>\
			</div>\
			<div class='item-body'><%= content %></div>\
			<div class='item-footer'>This item is read.</div>\
			</div>\
			</div>"));
		var elt = $(template({
			title: item.title,
			link: item.link,
			feedLink: item.feedLink,
			feedTitle: item.feedTitle,
			content: item.content
		}));
		elt.children(".one-line-item").on("click", function(e) {
			_this.toggleByIndex(_this.index);
			_this.index = item.elt.index();
			_this.toggleByIndex(_this.index);
			$(window).scrollTop(item.elt.offset().top);
			_this.markAsRead(item);
		});
		return elt;
	};
	return ReadingList;
})();
$(document).ready(function() {
	$("#menu-area #three-line-button").click(function(e) {
		$("#menu-area").toggleClass("open");
	});

	_rl = new ReadingList();

	$.getJSON("/feedlist", function(feeds) {
		var list = $("<ul/>").appendTo("#menu");

		var makeListItem = function(feed) {
			var item = $("<li/>").html(feed.title);
			item.data("feedId", feed.id);
			if (feed.id) {
				var redX = $("<span title='REMOVE' class='red-x'>x</span>");
				redX.click(function(e) {
					if (confirm("Are you sure you want to remove " + feed.title + "?")) {
						$.post('/removefeed', {
							feedId: feed.id
						}, function() {
							item.remove();
						});
						return false;
					}
				});
				item.prepend(redX);
			}
			return item;
		}

		_.each(feeds, function(feed) {
			var listItem = makeListItem(feed);
			listItem.click(function() {
				_rl.refresh($(this).data("feedId"));
			});
			list.append(listItem);
		});
		var addArea = $("<li/>");
		addArea.append("Add:");
		var addInput = $("<input/>").appendTo(addArea);
		addInput.keypress(function(e) {
			if (13 == e.which) { // enter
				var url = addInput.val();
				var tempListItem = makeListItem({
					title: url
				});
				list.append(tempListItem);

				var request = $.post("/addfeed", {
					url: url
				});
				request.done(function(res) {
					res.title += " (" + res.newArticleCount + ")";
					tempListItem.replaceWith(makeListItem(res));
				});
				request.fail(function(res) {
					tempListItem.replaceWith($("<li/>").html("Failed to add feed: " + url));
				})
				addInput.val("");
			}
			e.stopPropagation();
		});
		list.prepend(addArea);
	});
});
