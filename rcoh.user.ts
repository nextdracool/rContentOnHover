// ==UserScript==
// @name         Reddit Content on Hover
// @namespace    https://github.com/dracool/rContentOnHover
// @version      1.8
// @description  Adds in-page popup display of (some) posts content when hovering over the title
// @author       NeXtDracool
// @downloadURL  https://github.com/dracool/rContentOnHover/raw/master/build/rcoh.user.js
// @include      /https?:\/\/\w+\.reddit\.com\/r\/[^\/]+(?:\/(?:\?.*)*)*$/
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      gfycat.com
// @require      https://code.jquery.com/jquery-3.1.0.min.js
// @resource     TTStyle https://github.com/dracool/rContentOnHover/raw/master/build/rcoh.user.css
// ==/UserScript==
//add style for preview box
GM_addStyle(GM_getResourceText("TTStyle"));

(function (undefined?: any) {
	"use strict"

	class GMRequest {
		/**Runs an ajax request that ignores cross-origin settings
		 * @param options The synchronous flag is ignored, requests are always processes asynchronously
		 */
		static raw(options: GMXMLHttpRequestOptions): JQueryPromise<GMXMLHttpRequestResponse> {
			if (!options) return
			options.synchronous = false
			let deferred = $.Deferred<GMXMLHttpRequestResponse>()
			let onload = options.onload
			let onerror = options.onerror
			let onabort = options.onabort
			let ontimeout = options.ontimeout
			options.onload = (r) => {
				if (onload) onload(r)
				deferred.resolve(r)
			}
			options.onerror = (r) => {
				if (onerror) onerror(r)
				deferred.reject(r)
			}
			options.onabort = (r) => {
				if (onabort) onabort(r)
				deferred.reject(r)
			}
			options.ontimeout = (r) => {
				if (ontimeout) ontimeout(r)
				deferred.reject(r)
			}
			GM_xmlhttpRequest(options)
			return deferred.promise()
		}

		/**Runs an ajax GET request that ignores cross-origin security
		* @param options The synchronous flag is ignored, requests are always processes asynchronously
		* @param options The method is overwritten to GET if it was not set correctly
		*/
		static get(url: string | GMXMLHttpRequestOptions, options?: GMXMLHttpRequestOptions) {
			if (typeof url === "object") {
				options = url
			} else {
				if (!options) {
					options = {}
				}
				options.url = url
			}
			options.method = "GET"
			return GMRequest.raw(options)
		}
	}

	function prepareForImageContent(container : JQuery) : JQuery {
		return container.css({
			padding: "0",
			background: "black"
		})
	}

	function makeResizing(element : JQuery) : JQuery {
		return element.css({
			display: "block",
			width: "auto",
			height: "auto",
			"max-height": "296px"
		})
	}

	function manipulateDomForUrl(url: string, container: JQuery) {
		var map: [{ k: string | RegExp, v: (u: string, c: JQuery) => JQueryPromise<any> | boolean }] = [
			//reddit links are not prefixed with a domain and start with a /
			//also handles media preview images
			{
				k: "/",
				v: (u, c) => {
					return $.get(u)
						.done(function (data) {
							c.addClass("md-container usertext-body")
								.css({
									background: "#fafafa"
								})

							let item = $("<div/>").html(data)
							item = item.find("#siteTable")
							let temp = $(item).find("div.usertext-body > div")
							if (temp.length > 0) {
								temp.css({
									"overflow-y": "hidden",
									"max-height": "296px"
								})
								temp.appendTo(c)
								if(temp[0].scrollHeight > temp[0].clientHeight) {
									c.addClass("com-github-dracool-rContentOnHover-TT-overflown")
								}
								return
							}
							temp = $(item).find("div.media-preview-content img.preview")
							if (temp.length > 0) {
								prepareForImageContent(c)
								temp = makeResizing(temp)
								temp.appendTo(c)
								return
							}
						})
				}
			},
			{//basic domain independant image support
				k: /.+\.(?:png|jpg|gif)$/,
				v: (u, c) => {
					prepareForImageContent(c)
					let item = makeResizing($("<img></img>"))
						.attr("src", u)
					item.appendTo(c)
					return true
				}
			},
			{//gfycat support for standard links
				k: /https?:\/\/gfycat\.com\/*/,
				v: (u, c) => {
					//use special cross-origion get request to deal with gfycats origin access restriction
					return GMRequest.get(u, {
						headers: {
							origin: "gfycat.com",
							referer: "gfycat.com"
						}
					}).done(function (d) {
						prepareForImageContent(c)
						let item = $("<div/>").html(d.responseText)
						item = makeResizing(item.find("video"))
						  .removeAttr("controls")
						  
						item.appendTo(c)
					})
				}
			},
			{//gfycat support for direct video links
				k: "https://fat.gfycat.com/",
				v: (u, c) => {
					let item = makeResizing($("<video/>"))
						.attr("src", u)
						.attr("autoplay", "")
						.attr("loop", "")
					c.css({ padding: "0" })
					item.appendTo(c)
					return true
				}
			}
		]

		let promise: boolean | JQueryPromise<any> = false
		for (let el of map) {
			let k = el.k
			let v = el.v
			if (typeof k === "string") {
				if (url.startsWith(k)) {
					promise = el.v(url, container)
					break
				}
			} else if (el.k.constructor == RegExp) {
				if (url.match(k)) {
					promise = el.v(url, container)
					break
				}
			}
		}

		let finish = () =>{
			container.find("span.rContentOnHoverLoading").remove()
			container.addClass("com-github-dracool-rContentOnHover-TT-loaded")
		}
		if (typeof promise !== "boolean") {
			promise.done(finish)
			promise.fail(function (xhr, textStatus, errorThrown) {
				//swallow errors unhandled by mapped handlers, prevents crash on error in handler
			})
		} else if (promise) {
			finish()
		}
		return promise
	}

	var loaded: {
		[s: string]: {
			dom: JQuery,
			to?: number
		}
	} = {}

	function createTTContainer() {
		return $("<div/>")
			.addClass("com-github-dracool-rContentOnHover-TT")
			.html('<span class="rContentOnHoverLoading">Loading...</span>')
			.hide()
	}

	function onHoverStart(event: JQueryEventObject) {
		let url = $(event.target).attr("href")
		if (loaded[url]) {
			$(loaded[url].dom).fadeIn()
			clearTimeout(loaded[url].to)
			loaded[url].to = null
		} else {
			let domEl = createTTContainer().insertAfter($(event.target).parents("div.thing"))
			let res = manipulateDomForUrl(url, domEl)
			if (res) {
				loaded[url] = {
					dom: domEl
				}
				domEl.fadeIn()
			} else {
				domEl.remove()
			}
		}
	}

	function onHoverEnd(event: JQueryEventObject) {
		//return //DEBUG ONLY: let's me use the inspector on tooltip dom
		let url = $(event.target).attr("href")
		if (loaded[url]) {
			$(loaded[url].dom).fadeOut()
			loaded[url].to = setTimeout(function () {
				if (!loaded[url] || !loaded[url].dom) return
				$(loaded[url].dom).remove()
				loaded[url] = undefined
			}, 20000)
		}
	}

	$(document).ready(function () {
		//DEBUGGING ONLY: get rid of reddits pesky error handling
		//window.onerror = undefined
		$("div.thing").find("a.title, a.thumbnail").hover(onHoverStart, onHoverEnd)
	})
} ())
