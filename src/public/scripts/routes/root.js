import {
  loadTemplate,
  loadData,
  fetch,
  CommonDOMParser,
  ConcatStream,
  getCompiledTemplate,
  Request,
  Response,
  caches
 } from '../platform/common.js';

const root = (dataPath, assetPath) => {

  let config = loadData(`${dataPath}config.json`).then(r => r.json());
 
  let headTemplate = getCompiledTemplate(`${assetPath}templates/head.html`);
  let bodyTemplate = getCompiledTemplate(`${assetPath}templates/body.html`);
  let itemTemplate = getCompiledTemplate(`${assetPath}templates/item.html`);
  
  let jsonFeedData = fetchCachedFeedData(config, itemTemplate);
  
  /*
   * Render the head from the cache or network
   * Render the body.
     * Body has template that brings in config to work out what to render
     * If we have data cached let's bring that in.
   * Render the footer - contains JS to data bind client request.
  */
  
  const headStream = headTemplate.then(render => render({ config: config }));
  const bodyStream = jsonFeedData.then(columns => bodyTemplate.then(render => render({ config: config, columns: columns })));
  const footStream = loadTemplate(`${assetPath}templates/foot.html`);

  let concatStream = new ConcatStream;
  
  headStream.then(stream => stream.pipeTo(concatStream.writable, { preventClose:true }))
                .then(() => bodyStream)
                .then(stream => stream.pipeTo(concatStream.writable, { preventClose: true }))
                .then(() => footStream)
                .then(stream => stream.pipeTo(concatStream.writable));
  
  return Promise.resolve(new Response(concatStream.readable, { status: "200" }))
}


// Helpers
const fetchCachedFeedData = (config, itemTemplate) => {
  // Return a promise that resolves to a map of column id => cached data.
  const resolveCache = (cache, url) => (!!cache) ? cache.match(new Request(url)).then(response => (!!response) ? response.text() : undefined) : Promise.resolve();
  const mapColumnsToCache = (cache, config) => config.columns.map(column => [column, resolveCache(cache, `/proxy?url=${column.feedUrl}`)]);
  const mapCacheToTemplate = (columns) => columns.map(column => [column[0], column[1].then(items => itemTemplate.then(render => render({ items: convertFeedItemsToJSON(items)})))]);
    
  return caches.open('data')
      .then(cache => config.then(configData => mapColumnsToCache(cache, configData)))
      .then(columns => mapCacheToTemplate(columns));
};

const findNode = (tagName, nodes) => {
  return Array.prototype.find.call(nodes, n => n.tagName == tagName);
}

const findNodes = (tagName, nodes) => {
  return Array.prototype.filter.call(nodes, n => n.tagName == tagName);
}  

const sanitize = (str) => {
  const tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  };
  return str.replace(/[&<>]/g, (tag) => tagsToReplace[tag] || tag);
}
  
const convertFeedItemsToJSON = (feedText) => {
  if(feedText === undefined) return [];
  
  const parser = new CommonDOMParser();
  const feed = parser.parseFromString(feedText,'application/xml');
  const documentElement = feed.documentElement;
    
  if(documentElement.nodeName === 'rss') {
    const channel = findNode('channel', documentElement.childNodes);
    const items = findNodes('item', channel.childNodes);
    return items.map(item => convertRSSItemToJSON(item));
  }
  else if(documentElement.nodeName === 'feed') {
    const entrys = findNodes('entry', documentElement.childNodes);
    return entrys.map(entry => convertAtomItemToJSON(entry));
  }
  else {
    return [];
  }
}
  
const convertAtomItemToJSON = (item) => {
  const getElementText = (tagName) => {
    const elements = findNodes(tagName, item.childNodes);
    if(elements && elements.length > 0) {
      return elements[0].textContent;
    }
    
    return "";
  } 
  
  const getElementAttribute = (tagName, attribute) => {
    const elements = findNodes(tagName, item.childNodes);
    if(elements && elements.length > 0) {
      const href = elements[0].attributes.getNamedItem('href');
      return (href !== undefined) ? href.value : "";
    }
    
    return "";
  } 
  
  const title = getElementText("title");
  const description = getElementText("summary");
  const guid = getElementText("id");
  const pubDate = getElementText("updated");
  const author = getElementText("author");
  const link = getElementAttribute("link", "href");
  
  return {"title": sanitize(title), "guid": guid, "description": description, "pubDate": pubDate, "author": author, "link": link};
};
  
const convertRSSItemToJSON = (item) => {
  const getElementText = (tagName) => {
    const elements = findNodes(tagName, item.childNodes);
    if(elements && elements.length > 0) {
      return elements[0].textContent;
    }
    
    return "";
  } 
  
  const title = getElementText("title");
  const description = getElementText("description");
  const guid = getElementText("guid");
  const pubDate = getElementText("pubDate");
  const author = getElementText("author");
  const link = getElementText("link");
  
  return {"title": title, "guid": guid, "description": description, "pubDate": pubDate, "author": author, "link": link};
};

export const handler = root;