var fs = require('fs');
let cheerio = require('cheerio');
var request = require('request');
const shell = require('electron').shell;
const storage = require('electron-json-storage');
const path = require('path');

function openBrowserWindow(url)
{
    console.log("Opening new window for URL: " + url);
    shell.openExternal(url);
}

moment.updateLocale('en', {
    relativeTime : {
        future: "za %s",
        past:   "pre %s",
        s:  "sekundi",
        m:  "1 minut",
        mm: "%d minuta",
        h:  "sat vremena",
        hh: "%d sati",
        d:  "1 dan",
        dd: "%d dana",
        M:  "mesec dana",
        MM: "%d meseci",
        y:  "godinu dana",
        yy: "%d godina"
    }
});

var cookieJar = request.jar();
request = request.defaults({jar: cookieJar, strictSSL: false, headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:43.0) Gecko/20100101 Firefox/43.0'
}});

// var bounceLoader = VueSpinner.BounceLoader;
var rotateLoader = VueSpinner.RotateLoader;

var examData = null;
var subjectsData = null;
var semesters = null;

var bus = new Vue({
    created: function () {
        setInterval(function () {
            console.log("Emitting update event.");
            this.$emit('update');
        }.bind(this), 60 * 1000);
    }
});

document.addEventListener("keydown", function (e) {
    if (e.which === 116) {
        // location.reload();
        bus.$emit('update');
    }
});

storage.has('eref-credentials', function (error, has) {
    if (has) {
        storage.get('eref-credentials', function (error, data) {
            login.credentials = data;
            login.startLogin();
        });
    }
    else
    {
        login.manualLogin = true;
    }
});

var login = new Vue({
    el: '#login',
    data: {
        credentials: {
            username: '',
            password: ''
        },
        loading: false,
        loaded: false,
        disabled: false,
        manualLogin: false
    },
    components: {
        rotateLoader
    },
    methods: {
        startLogin: function (event) {
            this.loading = true;
            request.post({url:'https://eref.vts.su.ac.rs/sr/default/users/login', form: this.credentials}, function(err, httpResponse, body) {
                if (!err) {
                    request({url: 'https://eref.vts.su.ac.rs/sr/default/studentsdata/index'}, function (error, response, body) {
                        var bodyHtml = response.body.toString();
                        if (bodyHtml.includes(this.credentials.username))
                        {
                            console.log("Authentication verified.");

                            storage.set('eref-credentials', this.credentials, function(error) {});

                            this.loaded = true;
                            initialize();
                        }
                        else
                        {
                            console.log("Authentication unsuccessful.");
                            this.loading = false;
                        }
                    }.bind(this));
                }
            }.bind(this));
        }
    },
    watch: {
        loaded: function (val) {
            if (val) {
                setTimeout( _ => {
                    this.disabled = true;
                }, 1000)
            }
        }
    }
});

function initialize()
{
    var profilePanel = new Vue({
        el: '#profile',

        data: {
            firstName: null,
            lastName: null,
            index: null,
            generalCredit: null,
            tuitionCredit: null,
            updating: false
        },

        methods: {
            update: function(event) {
                this.updating = true;
                request({url: 'https://eref.vts.su.ac.rs/sr/default/studentsdata/index'}, function (error, response, body) {
                    var bodyHtml = response.body.toString();
                    let profilePage = cheerio.load(bodyHtml);

                    this.firstName = profilePage('#student-data').find('tr').eq(1).find('td').last().text();
                    this.lastName = profilePage('#student-data').find('tr').eq(3).find('td').last().text();
                    this.index = profilePage('#student-data').find('tr').eq(0).find('td').last().text();
                    this.generalCredit = profilePage('table').first().find('tr').eq(1).find('td').last().text();
                    this.tuitionCredit = profilePage('table').first().find('tr').last().find('td').last().text();

                    this.updating = false;
                }.bind(this));
            }
        },

        mounted: function () {
            this.update();
            bus.$on('update', function () {
                this.update();
            }.bind(this))
        }
    });

    var examsPanel = new Vue({
        el: '#ispiti',
        data: {
            exams: [],
            updating: false
        },
        methods: {
            update: function (event) {
                this.updating = true;
                request({url: 'https://eref.vts.su.ac.rs/sr/default/exams/index'}, function (error, response, body) {
                    var bodyHtml = response.body.toString();
                    let examPage = cheerio.load(bodyHtml);

                    examsPanel.exams = [];
                    examPage('table').eq(2).find('tr').slice(1).each(function(i, elem) {
                        examsPanel.exams.push({
                            name: examPage(elem).find('td').eq(0).text(),
                            day: examPage(elem).find('td').eq(1).text(),
                            time: examPage(elem).find('td').eq(2).text()
                        })
                    });
                    this.updating = false;
                }.bind(this));
            }
        },

        mounted: function () {
            this.update();
            bus.$on('update', function () {
                this.update();
            }.bind(this))
        }
    });

    var subjectsPanel = new Vue({
        el: '#predmeti-panel',
        data: {
            semesters: [],
            updating: false
        },

        methods: {
            update: function (event) {
                this.updating = true;
                request({url: 'https://eref.vts.su.ac.rs/sr/default/subjects/index'}, function (error, response, body) {
                    var bodyHtml = response.body.toString();
                    let subjectsPage = cheerio.load(bodyHtml);

                    subjectsData = [];
                    subjectsPage('tr.elec_sub, tr.req_sub').each(function (i, elem) {

                        var subject = {
                            semester: parseInt(subjectsPage(elem).find('td').eq(0).text(), 10),
                            name: subjectsPage(elem).find('td').eq(2).text(),
                            credits: subjectsPage(elem).find('td').eq(3).text(),
                            points: subjectsPage(elem).find('td').eq(8).text(),
                            grade: subjectsPage(elem).find('td').eq(9).text(),
                            selected: subjectsPage(elem).hasClass('selected_sub')
                        };

                        if (subject.grade.includes('Nije')) subject.grade = '/';

                        subjectsData.push(subject);
                    });

                    var highestSemester = 0;
                    semesters = [];
                    subjectsData.forEach(function (subject) {
                        if (subject.semester > highestSemester) highestSemester = subject.semester;
                    });

                    this.semesters = [];
                    for (var i = 1; i <= highestSemester; i++) {
                        var semesterArray = [];
                        subjectsData.forEach(function (item) {
                            if (item.semester == i) semesterArray.push(item);
                        });

                        var semesterObject = {
                            active: semesterArray.filter(function(sub) {return sub.selected}).length > 0,
                            subjects: semesterArray
                        };

                        this.semesters.push(semesterObject);
                    }
                    this.updating = false;
                }.bind(this));
            }
        },

        mounted: function () {
            this.update();
            bus.$on('update', function () {
                this.update();
            }.bind(this))
        }
    });

    var eBoardNews = new Vue({
        el: '#eboard-panel',
        data: {
            newsItems: [],
            updating: false
        },

        methods: {
            update: function (event) {
                this.updating = true;
                request({url: 'https://eref.vts.su.ac.rs/sr/default/eboard/news/noauth/'}, function (error, response, body) {
                    var bodyHtml = response.body.toString();
                    let eBoardNewsPage = cheerio.load(bodyHtml);

                    var eBoardItems = [];

                    this.newsItems = [];
                    eBoardNewsPage('.eboard-post').each(function(i, elem) {
                        var wordsInPostTop = eBoardNewsPage(elem).find('.eboard-post-top').text().split(" ").filter(function(word){return word != ''});
                        var dateString = wordsInPostTop[wordsInPostTop.length - 2];
                        var timeString = wordsInPostTop[wordsInPostTop.length - 1];
                        var dateTime = moment(dateString + " " + timeString, "DD.MM.YYYY HH.mm.ss");

                        this.newsItems.push({
                            dateTime: dateTime.format("D. M. YYYY. u HH:mm"),
                            relativeTimeString: dateTime.fromNow(),
                            author: eBoardNewsPage(elem).find('.professor-f').text(),
                            subject: eBoardNewsPage(elem).find('.subjects-f').text(),
                            title: eBoardNewsPage(elem).find('.eboard-post-title').text(),
                            content: eBoardNewsPage(elem).find('.eboard-post-content').html()
                        });

                    }.bind(this));
                    this.updating = false;
                }.bind(this));
            }
        },

        mounted: function () {
            this.update();
            bus.$on('update', function () {
                this.update();
            }.bind(this))
        }
    });
}

var linksPanel = new Vue({
    el: '#links-panel'
});
