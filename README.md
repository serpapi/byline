# byline

Find and save your articles from across the web.

**This is still early in development!**

### Using The Web App

Start the web server:

```
node src/web.js
```

You can change the port with `-port 80`.

The web server can also run in Docker or another compatible container engine:

```bash
docker build -t "byline:Dockerfile" .
docker run -p 80:8080 -d --restart on-failure "byline:main"
```

### Using The CLI Application

First, log in with your SerpApi account, which will save your API key to a `byline-settings.txt` file:

```bash
node src/cli.js -login
```

Then run Byline with `-author` and `-site` options to create the link list, with `-limit` set to 20 to use a maximum of 20 search credits:

```bash
node src/cli.js -author "Corbin Davenport" -site howtogeek.com -limit 20
```

You can add more options, like `-filters` for excluding certain URL paths, or `-i` for picking a different CSV file for the input:

```bash
node src/cli.js -i "/Users/Corbin/Desktop/myarticles.csv" -author "Corbin Davenport" -site howtogeek.com -filters "/archive/,/tag/,/category/" -limit 20
```

To create backups of your list, install [Monolith](https://github.com/Y2Z/monolith) and then use the `-backup` flag:

```bash
node src/cli.js -backup
node src/cli.js -i "/Users/Corbin/Desktop/myarticles.csv" -backup
```


### Advanced Usage

Byline can read an API key from the `SERPAPI_KEY` environment variable. If the environment variable exists, the `byline-settings.txt` file will not be used.