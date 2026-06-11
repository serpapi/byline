# byline

Find and save your articles from across the web.

**This is still early in development!**

### Getting Started

First, log in with your SerpApi account, which will save your API key to a `byline-settings.txt` file:

```
node src/cli.js -login
```

Then run the application:

```
node src/cli.js -author "Corbin Davenport" -site howtogeek.com -filters "/archive/,/tag/,/category/"
```

### Advanced Usage

Byline can read an API key from the `SERPAPI_KEY` environment variable. If the environment variable exists, the `byline-settings.txt` file will not be used.