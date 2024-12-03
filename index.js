"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@atproto/api");
const dotenv = __importStar(require("dotenv"));
const cron_1 = require("cron");
const process = __importStar(require("process"));
dotenv.config();
//BE SURE TO CREATE THE FOLLOWING ENVIRONMENT VARIABLES ON YOUR SYSTEM OR THIS WON'T WORK.
var username = (_a = process.env.BLUESKY_USER) !== null && _a !== void 0 ? _a : ""; //ex: testuser.bsky.social
var pw = (_b = process.env.BLUESKY_PW) !== null && _b !== void 0 ? _b : ""; //ex: myStrongPassword15%%
//DONT GET LOST IN THE OCEAN!
//UNFOLLOW ANYONE WHO'S FOLLOWING TOO MANY PEOPLE
//THEY WON'T SEE YOUR POSTS ANYWAY
var _MaxFollowing = 5000;
//DON'T FOLLOW PEOPLE WHO HAVEN'T POSTED YET.
//DON'T WORRY. IF THEY KEEP POSTING, WE'LL FOLLOW THEM LATER
var _MinPosts = 25;
//SET THIS TO TRUE IF YOU DON'T WANT TO AUTOMATICALLY POST TO YOUR PROFILE
var silentMode = true;
// Create a Bluesky Agent 
const agent = new api_1.BskyAgent({
    service: 'https://bsky.social',
});
function getFollowers(inCursor) {
    return __awaiter(this, void 0, void 0, function* () {
        //returns a list of all your current followers.
        var followerRequest = yield agent.getFollowers({ actor: username, limit: 100, cursor: inCursor });
        var l_followers = followerRequest.data.followers;
        if (followerRequest.data.cursor != null) {
            var newFollowers = yield getFollowers(followerRequest.data.cursor);
            l_followers = [...l_followers, ...newFollowers];
        }
        return l_followers;
    });
}
function getFollows(inCursor) {
    return __awaiter(this, void 0, void 0, function* () {
        //returns a list of everyone you currently follow.
        var followRequest = yield agent.getFollows({ actor: username, limit: 100, cursor: inCursor });
        var l_follows = followRequest.data.follows;
        if (followRequest.data.cursor != null) {
            var newFollows = yield getFollows(followRequest.data.cursor);
            l_follows = [...l_follows, ...newFollows];
        }
        return l_follows;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        //output variables for logging
        console.log("USER VARIABLES");
        console.log("\tUser: " + username);
        console.log("\tMax Following: " + _MaxFollowing);
        console.log("\tMin Posts: " + _MinPosts);
        console.log("\tSilent Mode: " + silentMode);
        //login first
        console.log("\nLogging in...");
        yield agent.login({ identifier: username, password: pw });
        var userDID = (yield agent.getProfile({ actor: username })).data.did;
        //get a list of followers
        console.log("\nGetting followers...");
        var followers = yield getFollowers("");
        console.log("\t" + followers.length + " Followers Found.");
        //get current follows
        console.log("\nGetting Follows...");
        var follows = yield getFollows("");
        console.log("\t" + follows.length + " Follows Found.");
        //create a list of just the DIDs for compare
        console.log("\nLooping through follows to find newbies...");
        console.log("Deleting people with too many follows while we're in this loop...");
        var followsDids = [];
        var unfollows = 0;
        for (var i = 0; i < follows.length; i++) {
            //while we're here, let's unfollow anyone who has too many followers. (as set by _MaxFollowing)        
            var userProfile = yield agent.getProfile({ actor: follows[i].did });
            var followsCount = (_a = userProfile.data.followsCount) !== null && _a !== void 0 ? _a : 0;
            if (followsCount >= _MaxFollowing) {
                console.log("\tUNFOLLOWING: " + follows[i].handle + " for following " + followsCount + " people.");
                //we have to call the Follow API again to get the URI.
                var userURI = (_c = (_b = userProfile.data.viewer) === null || _b === void 0 ? void 0 : _b.following) !== null && _c !== void 0 ? _c : "";
                yield agent.deleteFollow(userURI);
                unfollows++;
                continue;
            }
            //also check if they just haven't posted enough (As set by _MinPosts)
            var postsCount = (_d = userProfile.data.postsCount) !== null && _d !== void 0 ? _d : 0;
            if (postsCount < _MinPosts) {
                console.log("\tUNFOLLOWING: " + follows[i].handle + " because the've only made " + postsCount + " post(s).");
                //we have to call the Follow API again to get the URI.
                var userURI = (_f = (_e = userProfile.data.viewer) === null || _e === void 0 ? void 0 : _e.following) !== null && _f !== void 0 ? _f : "";
                yield agent.deleteFollow(userURI);
                unfollows++;
                continue;
            }
            followsDids.push(follows[i].did);
        }
        console.log("UNFOLLOWED: " + unfollows + " user(s) for following " + _MaxFollowing + " or more people.");
        console.log("\nFOLLWING BACK...");
        var newFollows = 0;
        var skippedFollows = 0;
        for (var i = 0; i < followers.length; i++) {
            var userProfile = yield agent.getProfile({ actor: followers[i].did });
            if (userProfile == null) {
                console.log("\tNULL PROFILE RETURNED. CONTINUING");
                continue;
            }
            var followsCount = (_g = userProfile.data.followsCount) !== null && _g !== void 0 ? _g : 0;
            var postsCount = (_h = userProfile.data.postsCount) !== null && _h !== void 0 ? _h : 0;
            //make sure they're not following too many people
            if (followsCount >= _MaxFollowing) {
                console.log("\tSKIPPED FOLLOWBACK FOR: " + followers[i].handle + " for following " + followsCount + " people");
                skippedFollows++;
                continue;
            }
            //make sure they've posted enough times
            if (postsCount < _MinPosts) {
                console.log("\tSKIPPED FOLLOWBACK FOR: " + followers[i].handle + " because they've only made " + postsCount + " posts.");
                skippedFollows++;
                continue;
            }
            //follow them back
            if (followsDids.indexOf(followers[i].did) == -1) {
                console.log("\tFOLLOWING BACK: " + followers[i].handle);
                yield agent.follow(followers[i].did);
                newFollows++;
            }
        }
        console.log("FOLLOWED BACK: " + newFollows + " unreciprocated users.");
        //post that I autmatically followed people
        if (newFollows > 0 && !silentMode) {
            console.log("\nPosting follows...");
            yield agent.post({
                text: "@followbackgrl.bsky.social just automatically followed back " + newFollows + " follower(s) for me.",
                facets: [
                    {
                        index: {
                            byteStart: 0,
                            byteEnd: 14
                        },
                        features: [{
                                $type: 'app.bsky.richtext.facet#mention',
                                did: 'did:plc:lsjqcjmyp5mzn7ba7frmh67m'
                            }]
                    }
                ]
            });
            console.log("\tPosted.");
        }
        else {
            var postNotification = "\n";
            if (silentMode)
                postNotification += "Silent Mode. ";
            postNotification += "Nothing to post.";
            console.log(postNotification);
        }
        //post that I autmatically unfollowed people
        if (unfollows > 0 && !silentMode) {
            console.log("\nPosting unfollows...");
            yield agent.post({
                text: "@followbackgrl just automatically unfollowed " + unfollows + " user(s) for exceeding my " + _MaxFollowing + " follower limit.",
                facets: [
                    {
                        index: {
                            byteStart: 0,
                            byteEnd: 14
                        },
                        features: [{
                                $type: 'app.bsky.richtext.facet#mention',
                                did: 'did:plc:lsjqcjmyp5mzn7ba7frmh67m'
                            }]
                    }
                ]
            });
            console.log("\tPosted.");
        }
        else {
            var postNotification = "\n";
            if (silentMode)
                postNotification += "Silent Mode. ";
            postNotification += "Nothing to post.";
            console.log(postNotification);
        }
        //Now make FollowBackGrl post about it regardless of silent mode.
        console.log("\nLogging in as FollowBackGrl...");
        yield agent.login({ identifier: "followbackgrl.bsky.social", password: pw });
        console.log("\tPosting user report...");
        yield agent.post({
            text: "User Report:\n" +
                "\{\n" +
                "\tUser: " + username + "\n" +
                "\tMax Follows: " + _MaxFollowing + "\n" +
                "\tMin Posts: " + _MinPosts + "\n" +
                "\tUnfollowed: " + unfollows + "\n" +
                "\tFollowed Back: " + newFollows + "\n" +
                "\tSkipped Followbacks: " + skippedFollows + "\n" +
                "\}" +
                "\n" +
                "This user has decided not to follow anyone with more than " + _MaxFollowing + " follows or fewer than " + _MinPosts + " posts.",
            facets: [
                {
                    index: {
                        byteStart: 22,
                        byteEnd: username.length + 22
                    },
                    features: [{
                            $type: 'app.bsky.richtext.facet#mention',
                            did: userDID
                        }]
                }
            ]
        });
        console.log("\tPosted.");
    });
}
main();
//Run this on a cron job
const scheduleExpression = '0 */1 * * *'; // Run once every hour
const job = new cron_1.CronJob(scheduleExpression, main);
job.start();
