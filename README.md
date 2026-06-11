# byline

Find and save your articles from across the web.

**This is still early in development!**

### Getting Started

First, log in with your SerpApi account, which will save your API key to a `byline-settings.txt` file:

```bash
node src/cli.js -login
```

Then run Byline with `-author` and `-site` options to create the link list:

```bash
node src/cli.js -author "Corbin Davenport" -site howtogeek.com -filters "/archive/,/tag/,/category/"
```

You can create backups of links with [Monolith](https://github.com/Y2Z/monolith) installed:

```bash
node src/cli.js -backup
```


### Advanced Usage

Byline can read an API key from the `SERPAPI_KEY` environment variable. If the environment variable exists, the `byline-settings.txt` file will not be used.