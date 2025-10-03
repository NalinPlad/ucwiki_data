import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync('./ucbwiki_data.db');

const req_url = "https://en.wikipedia.org/w/api.php?origin=*"

const params = {
	"action": "query",
	"format": "json",
	"list": "usercontribs",
	"formatversion": "2",
	"uclimit": "max",
	"uciprange": "2607:f140:400::/48",
	"ucprop": "ids|title|timestamp|comment|size|flags|tags|sizediff|oresscores"
}

