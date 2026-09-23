import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {doc,getDoc,setDoc} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";
import {auth,db,functions} from "./firebase_config.js";
const widget=document.querySelector("[data-profile-widget]");
if(widget){
const trigger=widget.querySelector(".profile-trigger"),menu=widget.querySelector("[data-profile-menu]"),name_el=widget.querySelector("[data-profile-name]"),avatar_el=widget.querySelector("[data-profile-avatar]");

const notification_button=document.createElement("button");
notification_button.type="button";
notification_button.className="notification-trigger";
notification_button.setAttribute("aria-label","Open recent releases");
notification_button.setAttribute("aria-expanded","false");
notification_button.innerHTML='<span aria-hidden="true">♢</span><b class="notification-badge" hidden>0</b>';
widget.insertBefore(notification_button,trigger);

const notification_panel=document.createElement("div");
notification_panel.className="notification-panel";
notification_panel.hidden=true;
notification_panel.innerHTML='<div class="notification-head"><div><strong>Recent releases</strong><span>Latest episodes and chapters in your library</span></div></div><div class="notification-list"><p class="notification-empty">Loading recent releases…</p></div>';
widget.appendChild(notification_panel);

const notification_badge=notification_button.querySelector(".notification-badge");
const notification_list=notification_panel.querySelector(".notification-list");
let notification_items=[];
let notification_timer=null;

function notification_time_label(value){
    if(!value)return "";
    const then=new Date(value).getTime();
    const diff=Math.max(0,Date.now()-then);
    const minutes=Math.floor(diff/60000);
    if(minutes<1)return "Just now";
    if(minutes<60)return minutes+"m ago";
    const hours=Math.floor(minutes/60);
    if(hours<24)return hours+"h ago";
    const days=Math.floor(hours/24);
    return days+"d ago";
}

async function mark_visible_releases_seen(){
    const unread=notification_items.filter(item=>!item.read);
    if(!unread.length)return;

    try{
        const mark_all=httpsCallable(functions,"markAllEntertainmentNotificationsRead");
        await mark_all();
        notification_items=notification_items.map(item=>({...item,read:true}));
        render_notifications();
    }catch(error){
        console.error("Unable to mark recent releases seen:",error);
    }
}

function release_kind_label(item){
    return item.type==="anime_episode"?"ANIME":"MANGA";
}

function release_display_title(item){
    return String(item.title||"New release")
        .replace(/^New episode ·\s*/,"")
        .replace(/^New chapter ·\s*/,"");
}

function render_notifications(){
    const unseen=notification_items.filter(item=>!item.read).length;
    notification_badge.hidden=unseen===0;
    notification_badge.textContent=unseen>99?"99+":String(unseen);

    notification_list.replaceChildren();

    if(!notification_items.length){
        const empty=document.createElement("p");
        empty.className="notification-empty";
        empty.textContent="No recent releases yet.";
        notification_list.appendChild(empty);
        return;
    }

    notification_items.forEach(item=>{
        const button=document.createElement("button");
        button.type="button";
        button.className="notification-item";
        button.dataset.notificationId=item.id;

        const kind=document.createElement("span");
        kind.className="release-kind "+(item.type==="anime_episode"?"anime":"manga");
        kind.textContent=release_kind_label(item);

        const copy=document.createElement("span");
        copy.className="notification-copy";

        const title=document.createElement("strong");
        title.textContent=release_display_title(item);

        const message=document.createElement("span");
        message.textContent=item.message||"";

        const meta=document.createElement("small");
        meta.textContent=[
            item.source,
            notification_time_label(item.deliver_at)
        ].filter(Boolean).join(" · ");

        copy.append(title,message,meta);
        button.append(kind,copy);
        notification_list.appendChild(button);
    });
}

async function load_notifications({mark_seen=false}={}){
    if(!current_user)return;
    try{
        const get_notifications=httpsCallable(functions,"getEntertainmentNotifications");
        const result=await get_notifications();
        notification_items=result.data?.notifications||[];
        render_notifications();

        if(mark_seen){
            await mark_visible_releases_seen();
        }
    }catch(error){
        console.error("Unable to load recent releases:",error);
    }
}

function open_notification_library(library){
    if(!library)return;

    const local_card=document.querySelector('[data-library="'+library.replaceAll('"','')+'"]');
    if(local_card){
        local_card.click();
        notification_panel.hidden=true;
        notification_button.setAttribute("aria-expanded","false");
        return;
    }

    window.location.href="../entertainment_page/Entertainment.html?library="+encodeURIComponent(library);
}

notification_button.addEventListener("click",event=>{
    event.stopPropagation();
    const will_open=notification_panel.hidden;
    notification_panel.hidden=!will_open;
    notification_button.setAttribute("aria-expanded",String(will_open));
    menu.hidden=true;
    trigger.setAttribute("aria-expanded","false");
    if(will_open)load_notifications({mark_seen:true});
});

notification_list.addEventListener("click",event=>{
    const button=event.target.closest("[data-notification-id]");
    if(!button)return;

    const item=notification_items.find(entry=>entry.id===button.dataset.notificationId);
    if(!item)return;

    open_notification_library(item.library);
});


const avatars=["../images/ChatGPT Image Sep 20, 2026, 02_41_21 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_30 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_46 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_53 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_42_03 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_46_25 AM.png"];const default_avatar=avatars[0];const themes=[{id:"stellaz",name:"Stellaz Original",description:"The original Stellaz look."},{id:"neon",name:"The Muckiverse",description:"Neon green, deep black, and a little radioactive energy."},{id:"flurple",name:"The Flurpleverse",description:"Royal purple, warm gold, and cosmic energy."},{id:"sunset",name:"The Sunsetverse",description:"Fire orange, deep crimson, and golden-hour glow."}];let current_user=null,selected_avatar=default_avatar,selected_theme="stellaz";
const dialog=document.createElement("dialog");dialog.className="profile-dialog";dialog.innerHTML=`<form class="profile-form"><div class="profile-dialog-head"><div><h2>Your Profile</h2><p>Choose how you appear around Stellaz.</p></div><button class="profile-close" type="button">×</button></div><div class="profile-field"><label for="profile_username">Username</label><input id="profile_username" maxlength="24" autocomplete="nickname" required></div><span class="profile-avatar-label">Profile picture</span><div class="profile-avatar-options">${avatars.map(a=>`<button class="avatar-choice" type="button" data-avatar="${a}"><img src="${a}" alt=""></button>`).join("")}</div><button class="profile-save" type="submit">Save Profile</button><p class="profile-message" aria-live="polite"></p></form>`;document.body.appendChild(dialog);
const input=dialog.querySelector("#profile_username"),message=dialog.querySelector(".profile-message");
let services_button=widget.querySelector("[data-profile-services]");
if(!services_button){
    services_button=document.createElement("button");
    services_button.type="button";
    services_button.dataset.profileServices="";
    services_button.textContent="Connected services";
    const logout_button=widget.querySelector("[data-profile-logout]");
    menu.insertBefore(services_button,logout_button);
}

let friends_button=widget.querySelector("[data-profile-friends]");
if(!friends_button){
    friends_button=document.createElement("button");
    friends_button.type="button";
    friends_button.dataset.profileFriends="";
    friends_button.textContent="Friends";
    menu.insertBefore(friends_button,services_button);
}

let guild_button=widget.querySelector("[data-profile-guild]");
if(!guild_button){
    guild_button=document.createElement("button");
    guild_button.type="button";
    guild_button.dataset.profileGuild="";
    guild_button.textContent="Guild";
    menu.insertBefore(guild_button,services_button);
}

const guild_dialog=document.createElement("dialog");
guild_dialog.className="profile-dialog guild-dialog";
guild_dialog.innerHTML=`
    <div class="profile-form guild-shell">
        <div class="profile-dialog-head">
            <div>
                <h2>Guild</h2>
                <p data-guild-subtitle>Create a guild with friends and build shared stats together.</p>
            </div>
            <button class="profile-close" type="button" aria-label="Close">×</button>
        </div>

        <p class="guild-message" aria-live="polite"></p>

        <section class="guild-empty-state" data-guild-empty>
            <form class="guild-create-form">
                <label for="guild_name_input">Create a guild</label>
                <div>
                    <input id="guild_name_input" maxlength="40"
                           autocomplete="off" placeholder="Guild name" required>
                    <button type="submit">Create</button>
                </div>
            </form>

            <section class="guild-section">
                <div class="guild-section-head">
                    <strong>Invitations</strong>
                    <span data-guild-invite-count>0</span>
                </div>
                <div class="guild-list" data-guild-incoming>
                    <p class="guild-empty">No guild invitations.</p>
                </div>
            </section>
        </section>

        <section class="guild-active-state" data-guild-active hidden>
            <div class="guild-summary">
                <div>
                    <span>YOUR GUILD</span>
                    <h3 data-guild-name>Guild</h3>
                </div>
                <span class="guild-role" data-guild-role>Member</span>
            </div>

            <section class="guild-section">
                <div class="guild-section-head">
                    <strong>Members</strong>
                    <span data-guild-member-count>0</span>
                </div>
                <div class="guild-list" data-guild-members></div>
            </section>

            <section class="guild-section">
                <div class="guild-section-head">
                    <strong>Invite a friend</strong>
                </div>
                <form class="guild-invite-form">
                    <select data-guild-friend-select aria-label="Friend to invite"></select>
                    <button type="submit">Invite</button>
                </form>
                <div class="guild-list guild-pending-list" data-guild-pending></div>
            </section>

            <button class="guild-leave-button" type="button">Leave guild</button>
        </section>
    </div>
`;
document.body.appendChild(guild_dialog);

const guild_message=guild_dialog.querySelector(".guild-message");
const guild_empty_state=guild_dialog.querySelector("[data-guild-empty]");
const guild_active_state=guild_dialog.querySelector("[data-guild-active]");
const guild_name_input=guild_dialog.querySelector("#guild_name_input");
const guild_incoming=guild_dialog.querySelector("[data-guild-incoming]");
const guild_invite_count=guild_dialog.querySelector("[data-guild-invite-count]");
const guild_name=guild_dialog.querySelector("[data-guild-name]");
const guild_role=guild_dialog.querySelector("[data-guild-role]");
const guild_member_count=guild_dialog.querySelector("[data-guild-member-count]");
const guild_members=guild_dialog.querySelector("[data-guild-members]");
const guild_friend_select=guild_dialog.querySelector("[data-guild-friend-select]");
const guild_pending=guild_dialog.querySelector("[data-guild-pending]");
let guild_overview={
    guild:null,
    incoming_invites:[],
    inviteable_friends:[],
    pending_invites:[]
};

let feedback_button=widget.querySelector("[data-profile-feedback]");
if(!feedback_button){
    feedback_button=document.createElement("button");
    feedback_button.type="button";
    feedback_button.dataset.profileFeedback="";
    feedback_button.textContent="Feedback";
    const logout_button=widget.querySelector("[data-profile-logout]");
    menu.insertBefore(feedback_button,logout_button);
}

const feedback_dialog=document.createElement("dialog");
feedback_dialog.className="profile-dialog feedback-dialog";
feedback_dialog.innerHTML=`
    <form class="profile-form feedback-form">
        <div class="profile-dialog-head">
            <div>
                <h2>Send Feedback</h2>
                <p>Tell the Stellaz developer what you would like changed, fixed, or added.</p>
            </div>
            <button class="profile-close" type="button" aria-label="Close">×</button>
        </div>
        <label class="feedback-label" for="stellaz_feedback_message">
            Your message
        </label>
        <textarea id="stellaz_feedback_message" maxlength="2000"
                  placeholder="What would you like to see changed?"
                  required></textarea>
        <div class="feedback-footer">
            <span class="feedback-hint">For now, this goes directly to the Stellaz developer.</span>
            <span class="feedback-counter" data-feedback-counter>0 / 2000</span>
        </div>
        <button class="profile-save" type="submit">Send feedback</button>
        <p class="profile-message feedback-message" aria-live="polite"></p>
    </form>
`;
document.body.appendChild(feedback_dialog);

const feedback_textarea=
    feedback_dialog.querySelector("#stellaz_feedback_message");
const feedback_message=
    feedback_dialog.querySelector(".feedback-message");
const feedback_counter=
    feedback_dialog.querySelector("[data-feedback-counter]");

const friends_dialog=document.createElement("dialog");
friends_dialog.className="profile-dialog friends-dialog";
friends_dialog.innerHTML=`
    <div class="profile-form friends-shell">
        <div class="profile-dialog-head">
            <div>
                <h2>Friends</h2>
                <p>Send requests by Stellaz username and keep your friends together.</p>
            </div>
            <button class="profile-close" type="button">×</button>
        </div>
        <form class="friend-add-form">
            <input id="friend_username_input" maxlength="24"
                   autocomplete="off" placeholder="Enter a username"
                   aria-label="Friend username" required>
            <button type="submit">Send request</button>
        </form>
        <p class="friend-message" aria-live="polite"></p>
        <section class="friend-section">
            <div class="friend-section-head">
                <strong>Requests</strong>
                <span data-friend-request-count>0</span>
            </div>
            <div class="friend-list" data-friend-requests>
                <p class="friend-empty">No pending requests.</p>
            </div>
        </section>
        <section class="friend-section">
            <div class="friend-section-head">
                <strong>Friends</strong>
                <span data-friend-count>0</span>
            </div>
            <div class="friend-list" data-friend-list>
                <p class="friend-empty">No friends yet.</p>
            </div>
        </section>
        <section class="friend-section friend-sent-section">
            <div class="friend-section-head">
                <strong>Sent</strong>
                <span data-friend-sent-count>0</span>
            </div>
            <div class="friend-list" data-friend-sent>
                <p class="friend-empty">No outgoing requests.</p>
            </div>
        </section>
    </div>
`;
document.body.appendChild(friends_dialog);

const friend_library_dialog=document.createElement("dialog");
friend_library_dialog.className="profile-dialog friend-library-dialog";
friend_library_dialog.innerHTML=`
    <div class="profile-form friend-library-shell">
        <div class="profile-dialog-head friend-library-head">
            <div class="friend-library-person">
                <img data-friend-library-avatar alt="">
                <div>
                    <span>FRIEND LIBRARY</span>
                    <h2 data-friend-library-name>Library</h2>
                </div>
            </div>
            <button class="profile-close" type="button">×</button>
        </div>
        <div class="friend-library-tabs" role="tablist">
            <button type="button" data-friend-library-tab="movies">Movies <span>0</span></button>
            <button type="button" data-friend-library-tab="shows">TV Shows <span>0</span></button>
            <button type="button" data-friend-library-tab="anime">Anime <span>0</span></button>
            <button type="button" data-friend-library-tab="manga">Manga <span>0</span></button>
        </div>
        <div class="friend-library-grid" data-friend-library-grid>
            <p class="friend-library-loading">Loading library…</p>
        </div>
    </div>
`;
document.body.appendChild(friend_library_dialog);

const friend_library_name=
    friend_library_dialog.querySelector("[data-friend-library-name]");
const friend_library_avatar=
    friend_library_dialog.querySelector("[data-friend-library-avatar]");
const friend_library_grid=
    friend_library_dialog.querySelector("[data-friend-library-grid]");
const friend_library_tabs=
    [...friend_library_dialog.querySelectorAll("[data-friend-library-tab]")];

let friend_library_data=null;
let friend_library_active="movies";
let friend_library_return_to_friends=false;

function friend_library_status_label(value){
    return String(value||"")
        .replaceAll("_"," ")
        .replace(/\b\w/g,letter=>letter.toUpperCase());
}

function friend_library_meta(item,type){
    const parts=[];

    if(type==="movies"||type==="shows"){
        if(item.year)parts.push(String(item.year));
        if(item.status)parts.push(friend_library_status_label(item.status));
    }else if(type==="anime"){
        if(item.status)parts.push(friend_library_status_label(item.status));
        const watched=Number(item.episodes_watched||0);
        const total=Number(item.total_episodes||0);
        if(total>0)parts.push(watched+"/"+total+" eps");
        else if(watched>0)parts.push(watched+" eps");
    }else{
        if(item.user_status)parts.push(friend_library_status_label(item.user_status));
        const read=Number(item.chapters_read||0);
        const total=Number(item.total_chapters||0);
        if(total>0)parts.push(read+"/"+total+" ch");
        else if(read>0)parts.push(read+" ch");
    }

    if(item.my_rating!==null&&item.my_rating!==undefined){
        parts.push("★ "+Number(item.my_rating)+"/10");
    }

    return parts.join(" · ");
}

function render_friend_library(){
    if(!friend_library_data)return;

    const rows=friend_library_data[friend_library_active]||[];

    friend_library_tabs.forEach(button=>{
        const type=button.dataset.friendLibraryTab;
        const count=(friend_library_data[type]||[]).length;
        const count_el=button.querySelector("span");
        if(count_el)count_el.textContent=String(count);
        button.classList.toggle("active",type===friend_library_active);
        button.setAttribute(
            "aria-selected",
            String(type===friend_library_active)
        );
    });

    friend_library_grid.replaceChildren();

    if(!rows.length){
        const empty=document.createElement("p");
        empty.className="friend-library-empty";
        empty.textContent="Nothing in this library yet.";
        friend_library_grid.appendChild(empty);
        return;
    }

    rows.forEach(item=>{
        const card=document.createElement("article");
        card.className="friend-library-card";

        if(item.poster_url){
            const image=document.createElement("img");
            image.src=item.poster_url;
            image.alt="";
            image.loading="lazy";
            card.appendChild(image);
        }else{
            const placeholder=document.createElement("div");
            placeholder.className="friend-library-poster-placeholder";
            placeholder.textContent=String(item.title||"?").slice(0,1);
            card.appendChild(placeholder);
        }

        const copy=document.createElement("div");
        copy.className="friend-library-card-copy";

        const title=document.createElement("strong");
        title.textContent=item.title||"Untitled";

        const meta=document.createElement("span");
        meta.textContent=friend_library_meta(
            item,
            friend_library_active
        );

        copy.append(title,meta);
        card.appendChild(copy);
        friend_library_grid.appendChild(card);
    });
}

async function open_friend_library(friend_uid){
    const friend=(friend_overview.friends||[])
        .find(item=>item.uid===friend_uid);

    friend_library_return_to_friends=friends_dialog.open;
    if(friends_dialog.open)friends_dialog.close();

    friend_library_data=null;
    friend_library_active="movies";
    friend_library_name.textContent=friend?.username||"Friend";
    friend_library_avatar.src=friend_avatar_src(friend);
    friend_library_grid.innerHTML=
        '<p class="friend-library-loading">Loading library…</p>';

    if(!friend_library_dialog.open){
        friend_library_dialog.showModal();
    }

    try{
        const get_library=
            httpsCallable(functions,"getFriendEntertainmentLibrary");
        const result=await get_library({friend_uid});
        friend_library_data=result.data||{
            movies:[],
            shows:[],
            anime:[],
            manga:[]
        };

        const profile=friend_library_data.friend||friend;
        friend_library_name.textContent=
            profile?.username||"Friend";
        friend_library_avatar.src=
            friend_avatar_src(profile);

        const preferred=["movies","shows","anime","manga"]
            .find(type=>(friend_library_data[type]||[]).length);
        friend_library_active=preferred||"movies";
        render_friend_library();
    }catch(error){
        console.error("Unable to load friend library:",error);
        friend_library_grid.replaceChildren();
        const failed=document.createElement("p");
        failed.className="friend-library-empty";
        failed.textContent=
            error?.message||
            "Unable to load this friend's library.";
        friend_library_grid.appendChild(failed);
    }
}

friend_library_tabs.forEach(button=>{
    button.addEventListener("click",()=>{
        friend_library_active=
            button.dataset.friendLibraryTab;
        render_friend_library();
    });
});

friend_library_dialog.querySelector(".profile-close")
    .addEventListener("click",()=>friend_library_dialog.close());

friend_library_dialog.addEventListener("close",()=>{
    if(friend_library_return_to_friends){
        friend_library_return_to_friends=false;
        if(!friends_dialog.open)friends_dialog.showModal();
    }
});

const friend_username_input=
    friends_dialog.querySelector("#friend_username_input");
const friend_message=
    friends_dialog.querySelector(".friend-message");
const friend_request_list=
    friends_dialog.querySelector("[data-friend-requests]");
const friend_list=
    friends_dialog.querySelector("[data-friend-list]");
const friend_sent_list=
    friends_dialog.querySelector("[data-friend-sent]");
const friend_request_count=
    friends_dialog.querySelector("[data-friend-request-count]");
const friend_count=
    friends_dialog.querySelector("[data-friend-count]");
const friend_sent_count=
    friends_dialog.querySelector("[data-friend-sent-count]");

let friend_overview={
    friends:[],
    incoming:[],
    outgoing:[]
};

function friend_avatar_src(profile){
    return avatars.includes(profile?.profile_avatar)
        ? profile.profile_avatar
        : default_avatar;
}

function friend_identity(profile){
    const identity=document.createElement("div");
    identity.className="friend-identity";

    const avatar=document.createElement("img");
    avatar.className="friend-avatar";
    avatar.src=friend_avatar_src(profile);
    avatar.alt="";

    const username=document.createElement("strong");
    username.textContent=profile?.username||"Stellaz user";

    identity.append(avatar,username);
    return identity;
}

function friend_empty(text){
    const empty=document.createElement("p");
    empty.className="friend-empty";
    empty.textContent=text;
    return empty;
}

function render_friend_overview(){
    const friends=friend_overview.friends||[];
    const incoming=friend_overview.incoming||[];
    const outgoing=friend_overview.outgoing||[];

    friend_count.textContent=String(friends.length);
    friend_request_count.textContent=String(incoming.length);
    friend_sent_count.textContent=String(outgoing.length);
    friends_button.textContent=incoming.length
        ? "Friends ("+incoming.length+")"
        : "Friends";

    friend_list.replaceChildren();
    friend_request_list.replaceChildren();
    friend_sent_list.replaceChildren();

    if(!friends.length){
        friend_list.appendChild(friend_empty("No friends yet."));
    }else{
        friends.forEach(profile=>{
            const row=document.createElement("div");
            row.className="friend-row";

            const actions=document.createElement("div");
            actions.className="friend-actions";

            const view_library=document.createElement("button");
            view_library.type="button";
            view_library.className="friend-view-library";
            view_library.dataset.friendLibraryUid=profile.uid;
            view_library.textContent="View library";

            actions.appendChild(view_library);
            row.append(friend_identity(profile),actions);
            friend_list.appendChild(row);
        });
    }

    if(!incoming.length){
        friend_request_list.appendChild(
            friend_empty("No pending requests.")
        );
    }else{
        incoming.forEach(profile=>{
            const row=document.createElement("div");
            row.className="friend-row";

            const actions=document.createElement("div");
            actions.className="friend-actions";

            const accept=document.createElement("button");
            accept.type="button";
            accept.className="friend-accept";
            accept.dataset.friendRequestId=profile.request_id;
            accept.dataset.friendAction="accept";
            accept.textContent="Accept";

            const decline=document.createElement("button");
            decline.type="button";
            decline.className="friend-decline";
            decline.dataset.friendRequestId=profile.request_id;
            decline.dataset.friendAction="decline";
            decline.textContent="Decline";

            actions.append(accept,decline);
            row.append(friend_identity(profile),actions);
            friend_request_list.appendChild(row);
        });
    }

    if(!outgoing.length){
        friend_sent_list.appendChild(
            friend_empty("No outgoing requests.")
        );
    }else{
        outgoing.forEach(profile=>{
            const row=document.createElement("div");
            row.className="friend-row";

            const pending=document.createElement("span");
            pending.className="friend-pending";
            pending.textContent="Pending";

            row.append(friend_identity(profile),pending);
            friend_sent_list.appendChild(row);
        });
    }
}

async function load_friend_overview(){
    if(!current_user)return;

    try{
        const get_overview=
            httpsCallable(functions,"getFriendOverview");
        const result=await get_overview();
        friend_overview=result.data||{
            friends:[],
            incoming:[],
            outgoing:[]
        };
        render_friend_overview();
    }catch(error){
        console.error("Unable to load friends:",error);
        friend_message.textContent=
            "Unable to load friends right now.";
    }
}

async function ensure_friend_username(){
    if(!current_user)return false;

    try{
        const ensure_index=
            httpsCallable(functions,"ensureStellazUsernameIndex");
        const result=await ensure_index();

        if(result.data?.indexed){
            return true;
        }

        if(result.data?.needs_username_change){
            friend_message.textContent=
                "Your username is already used by another older account. Open Edit profile and choose a unique username.";
        }else{
            friend_message.textContent=
                "Set a username in Edit profile before using Friends.";
        }

        return false;
    }catch(error){
        console.error("Unable to prepare friend username:",error);
        return false;
    }
}

friends_button.addEventListener("click",async()=>{
    menu.hidden=true;
    trigger.setAttribute("aria-expanded","false");
    friend_message.textContent="";
    friends_dialog.showModal();
    await ensure_friend_username();
    await load_friend_overview();
});

friends_dialog.querySelector(".profile-close")
    .addEventListener("click",()=>friends_dialog.close());

friends_dialog.querySelector(".friend-add-form")
    .addEventListener("submit",async event=>{
        event.preventDefault();

        const username=friend_username_input.value.trim();
        if(!username)return;

        friend_message.textContent="Sending request...";

        try{
            const send_request=
                httpsCallable(functions,"sendFriendRequest");
            const result=await send_request({username});
            friend_username_input.value="";
            friend_message.textContent=
                "Friend request sent to "+
                (result.data?.username||username)+".";
            await load_friend_overview();
        }catch(error){
            console.error("Unable to send friend request:",error);
            friend_message.textContent=
                error?.message||
                "Unable to send that friend request.";
        }
    });

friend_list.addEventListener("click",async event=>{
    const button=event.target.closest("[data-friend-library-uid]");
    if(!button)return;

    button.disabled=true;
    try{
        await open_friend_library(
            button.dataset.friendLibraryUid
        );
    }finally{
        button.disabled=false;
    }
});

friend_request_list.addEventListener("click",async event=>{
    const button=event.target.closest("[data-friend-action]");
    if(!button)return;

    const request_id=button.dataset.friendRequestId;
    const action=button.dataset.friendAction;
    button.disabled=true;
    friend_message.textContent=
        action==="accept"
            ?"Accepting friend request..."
            :"Declining friend request...";

    try{
        const respond=
            httpsCallable(functions,"respondToFriendRequest");
        await respond({request_id,action});
        friend_message.textContent=
            action==="accept"
                ?"Friend request accepted."
                :"Friend request declined.";
        await load_friend_overview();
    }catch(error){
        console.error("Unable to answer friend request:",error);
        friend_message.textContent=
            error?.message||
            "Unable to answer that friend request.";
        button.disabled=false;
    }
});
const theme_dialog=document.createElement("dialog");theme_dialog.className="profile-dialog theme-dialog";theme_dialog.innerHTML=`<div class="profile-form"><div class="profile-dialog-head"><div><h2>Theme</h2><p>Choose how Stellaz looks for your account.</p></div><button class="profile-close" type="button">×</button></div><div class="theme-options">${themes.map(t=>`<button class="theme-choice" type="button" data-theme="${t.id}"><strong>${t.name}</strong><span>${t.description}</span></button>`).join("")}</div></div>`;document.body.appendChild(theme_dialog);
function apply_theme(theme){selected_theme=themes.some(t=>t.id===theme)?theme:"stellaz";document.documentElement.dataset.theme=selected_theme;theme_dialog.querySelectorAll(".theme-choice").forEach(b=>b.classList.toggle("selected",b.dataset.theme===selected_theme))}

function render(n,a){name_el.textContent=n||"Account";const avatar=avatars.includes(a)?a:default_avatar;avatar_el.textContent="";let img=avatar_el.querySelector("img");if(!img){img=document.createElement("img");img.alt="";avatar_el.appendChild(img)}img.src=avatar}function select(a){selected_avatar=a;dialog.querySelectorAll(".avatar-choice").forEach(b=>b.classList.toggle("selected",b.dataset.avatar===a))}
trigger.addEventListener("click",e=>{e.stopPropagation();notification_panel.hidden=true;notification_button.setAttribute("aria-expanded","false");menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden))});document.addEventListener("click",e=>{if(!widget.contains(e.target)){menu.hidden=true;notification_panel.hidden=true;trigger.setAttribute("aria-expanded","false");notification_button.setAttribute("aria-expanded","false")}});
widget.querySelector("[data-profile-edit]").addEventListener("click",()=>{menu.hidden=true;message.textContent="";dialog.showModal()});widget.querySelector("[data-profile-theme]")?.addEventListener("click",()=>{menu.hidden=true;apply_theme(selected_theme);theme_dialog.showModal()});services_button.addEventListener("click",()=>{menu.hidden=true;trigger.setAttribute("aria-expanded","false");const services_dialog=document.getElementById("connected_services_dialog");if(services_dialog){if(!services_dialog.open)services_dialog.showModal();return}window.location.href="../entertainment_page/Entertainment.html?services=1"});feedback_button.addEventListener("click",()=>{menu.hidden=true;feedback_message.textContent="";feedback_counter.textContent=feedback_textarea.value.length+" / 2000";feedback_dialog.showModal();feedback_textarea.focus()});widget.querySelector("[data-profile-logout]").addEventListener("click",async()=>{await signOut(auth);window.location.href="../index.html"});
dialog.querySelector(".profile-close").addEventListener("click",()=>dialog.close());theme_dialog.querySelector(".profile-close").addEventListener("click",()=>theme_dialog.close());feedback_dialog.querySelector(".profile-close").addEventListener("click",()=>feedback_dialog.close());theme_dialog.querySelectorAll(".theme-choice").forEach(b=>b.addEventListener("click",async()=>{if(!current_user)return;const theme=b.dataset.theme;apply_theme(theme);try{await setDoc(doc(db,"users",current_user.uid),{theme},{merge:true});theme_dialog.close()}catch(error){console.error(error)}}));dialog.querySelectorAll(".avatar-choice").forEach(b=>b.addEventListener("click",()=>select(b.dataset.avatar)));
dialog.querySelector(".profile-form").addEventListener("submit",async e=>{e.preventDefault();if(!current_user)return;const display_name=input.value.trim();if(!display_name)return;message.textContent="Saving...";try{const save_profile=httpsCallable(functions,"saveStellazProfile");const result=await save_profile({username:display_name,profile_avatar:selected_avatar});const saved_name=result.data?.username||display_name;input.value=saved_name;render(saved_name,selected_avatar);message.textContent="Profile saved.";await load_friend_overview();setTimeout(()=>dialog.close(),450)}catch(error){console.error(error);message.textContent=error?.code==="functions/already-exists"?"That username is already taken.":(error?.message||"Unable to save profile.");}});
feedback_textarea.addEventListener("input",()=>{
    feedback_counter.textContent=feedback_textarea.value.length+" / 2000";
});
feedback_dialog.querySelector(".feedback-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!current_user)return;

    const feedback=feedback_textarea.value.trim();
    if(!feedback)return;

    const submit_button=feedback_dialog.querySelector(".profile-save");
    submit_button.disabled=true;
    submit_button.textContent="Sending...";
    feedback_message.textContent="";

    try{
        const submit_feedback=httpsCallable(functions,"submitFeedback");
        await submit_feedback({
            message:feedback,
            page:window.location.pathname
        });
        feedback_textarea.value="";
        feedback_counter.textContent="0 / 2000";
        feedback_message.textContent="Thanks — your feedback was sent.";
        setTimeout(()=>feedback_dialog.close(),700);
    }catch(error){
        console.error("Unable to send feedback:",error);
        feedback_message.textContent=
            error?.message||"Unable to send feedback right now.";
    }finally{
        submit_button.disabled=false;
        submit_button.textContent="Send feedback";
    }
});
onAuthStateChanged(auth,async user=>{if(!user){window.location.href="../index.html";return}current_user=user;const fallback=user.email?.split("@")[0]||"Account";try{const snap=await getDoc(doc(db,"users",user.uid)),profile=snap.exists()?snap.data():{};const display_name=profile.display_name||fallback;selected_avatar=avatars.includes(profile.profile_avatar)?profile.profile_avatar:default_avatar;selected_theme=profile.theme||"stellaz";apply_theme(selected_theme);input.value=display_name;select(selected_avatar);render(display_name,selected_avatar)}catch(error){console.error(error);apply_theme("stellaz");input.value=fallback;render(fallback,default_avatar)}await ensure_friend_username();await Promise.allSettled([load_notifications(),load_friend_overview()]);if(notification_timer)clearInterval(notification_timer);notification_timer=setInterval(()=>load_notifications({mark_seen:!notification_panel.hidden}),60000)});
}
// Profile, Friends, and Friend Library dialogs can all be dismissed
// by clicking the backdrop as well as their close button.
function enable_profile_dialog_backdrop_close(dialog){
    if(!dialog||dialog.dataset.backdropCloseReady==="true")return;
    dialog.dataset.backdropCloseReady="true";
    dialog.addEventListener("click",event=>{
        if(!dialog.open)return;
        const bounds=dialog.getBoundingClientRect();
        const outside=event.clientX<bounds.left||event.clientX>bounds.right||
            event.clientY<bounds.top||event.clientY>bounds.bottom;
        if(outside)dialog.close();
    });
}
document.querySelectorAll("dialog.profile-dialog").forEach(enable_profile_dialog_backdrop_close);
