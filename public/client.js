var ReadingList = (function () {
	function ReadingList() {
		this.elt = $("<div/>");
		$("#main").append(this.elt);
		this.refresh();

		var _this = this;
		$(window).keypress(function (e) {
			if(106 == e.which) // j
				_this.move(1);
			if(107 == e.which) // k
				_this.move(-1);
			if( 114==e.which ) // r
				_this.refresh();
		});
	}
	ReadingList.prototype.refresh = function() {
		var _this = this;
		this.index = -1;
		this.elt.empty();
		$.getJSON("/readinglist", function( items ) {
			_this.list = items;
			_.each( items, function(item) {
				item.elt = _this.createEltFromItem(item);
				_this.elt.append(item.elt);
			});
		});
	};
	ReadingList.prototype.toggleByIndex = function (index) {
		if(index >= 0 && index < this.list.length) {
			$(this.list[index].elt).children(".full-item, .one-line-item").toggle();
		}
	};
	ReadingList.prototype.move = function (delta) {
		var newIndex = this.index + delta;
		newIndex = Math.max( newIndex, 0 );
		newIndex = Math.min( newIndex, this.list.length-1 );
		if( newIndex != this.index ) {
			this.toggleByIndex(this.index);
			this.index = newIndex;
			this.toggleByIndex(newIndex);
			var item = $(this.list[newIndex].elt);
			$(window).scrollTop(item.offset().top);
		}
	};
	ReadingList.prototype.createEltFromItem = function (item) {
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
					<div class='item-footer'>&nbsp;</div>\
				</div>\
			</div>"));
		var elt = $(template({
			title: item.title,
			link: item.link,
			feedLink: item.feedLink,
			feedTitle: item.feedTitle,
			content: item.content
		}));
		elt.children(".one-line-item").on("click", function (e) {
			_this.toggleByIndex(_this.index);
			var item = $(e.currentTarget).parent();
			_this.index = item.index();
			_this.toggleByIndex(_this.index);
			$(window).scrollTop(item.offset().top);
		});
		return elt;
	};
	return ReadingList;
})();
$(document).ready(function () {
	$("#menu-area #three-line-button").click(function (e) {
		$("#menu-area").toggleClass("open");
	});

	_rl = new ReadingList();

	$.getJSON("/feedlist", function(feeds) {
		var list = $("<ul/>").appendTo("#menu");

		var makeListItem = function( feed ) {
			var item = $("<li/>").html(feed);
			var redX = $("<span title='REMOVE' class='red-x'>x</span>");
			item.prepend(redX);
			return item;
		}

		_.each( feeds, function(feed) {
			list.append(makeListItem(feed));
		});
		var addArea = $("<li/>");
		addArea.append("Add:");
		var addInput = $("<input/>").appendTo(addArea);
		addInput.keypress( function(e) {
			if(13==e.which) { // enter
				$.post("/addfeed", {url:addInput.val()});
				addArea.before(makeListItem(addInput.val()));
				addInput.val("");
			}
		});
		list.append(addArea);
	});
});
