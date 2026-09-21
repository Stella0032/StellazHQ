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


const avatars=["../images/ChatGPT Image Sep 20, 2026, 02_41_21 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_30 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_46 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_41_53 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_42_03 AM.png","../images/ChatGPT Image Sep 20, 2026, 02_46_25 AM.png"];const default_avatar=avatars[0];const themes=[{id:"stellaz",name:"Stellaz Original",description:"The original Stellaz look."},{id:"neon",name:"The Muckiverse",description:"Neon green, deep black, and a little radioactive energy."},{id:"flurple",name:"The Flurpleverse",description:"Royal purple, warm gold, and cosmic energy."}];let current_user=null,selected_avatar=default_avatar,selected_theme="stellaz";
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
const theme_dialog=document.createElement("dialog");theme_dialog.className="profile-dialog theme-dialog";theme_dialog.innerHTML=`<div class="profile-form"><div class="profile-dialog-head"><div><h2>Theme</h2><p>Choose how Stellaz looks for your account.</p></div><button class="profile-close" type="button">×</button></div><div class="theme-options">${themes.map(t=>`<button class="theme-choice" type="button" data-theme="${t.id}"><strong>${t.name}</strong><span>${t.description}</span></button>`).join("")}</div></div>`;document.body.appendChild(theme_dialog);
function apply_theme(theme){selected_theme=themes.some(t=>t.id===theme)?theme:"stellaz";document.documentElement.dataset.theme=selected_theme;theme_dialog.querySelectorAll(".theme-choice").forEach(b=>b.classList.toggle("selected",b.dataset.theme===selected_theme))}

function render(n,a){name_el.textContent=n||"Account";const avatar=avatars.includes(a)?a:default_avatar;avatar_el.textContent="";let img=avatar_el.querySelector("img");if(!img){img=document.createElement("img");img.alt="";avatar_el.appendChild(img)}img.src=avatar}function select(a){selected_avatar=a;dialog.querySelectorAll(".avatar-choice").forEach(b=>b.classList.toggle("selected",b.dataset.avatar===a))}
trigger.addEventListener("click",e=>{e.stopPropagation();notification_panel.hidden=true;notification_button.setAttribute("aria-expanded","false");menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden))});document.addEventListener("click",e=>{if(!widget.contains(e.target)){menu.hidden=true;notification_panel.hidden=true;trigger.setAttribute("aria-expanded","false");notification_button.setAttribute("aria-expanded","false")}});
widget.querySelector("[data-profile-edit]").addEventListener("click",()=>{menu.hidden=true;message.textContent="";dialog.showModal()});widget.querySelector("[data-profile-theme]")?.addEventListener("click",()=>{menu.hidden=true;apply_theme(selected_theme);theme_dialog.showModal()});services_button.addEventListener("click",()=>{menu.hidden=true;trigger.setAttribute("aria-expanded","false");const services_dialog=document.getElementById("connected_services_dialog");if(services_dialog){if(!services_dialog.open)services_dialog.showModal();return}window.location.href="../entertainment_page/Entertainment.html?services=1"});widget.querySelector("[data-profile-logout]").addEventListener("click",async()=>{await signOut(auth);window.location.href="../index.html"});
dialog.querySelector(".profile-close").addEventListener("click",()=>dialog.close());theme_dialog.querySelector(".profile-close").addEventListener("click",()=>theme_dialog.close());theme_dialog.querySelectorAll(".theme-choice").forEach(b=>b.addEventListener("click",async()=>{if(!current_user)return;const theme=b.dataset.theme;apply_theme(theme);try{await setDoc(doc(db,"users",current_user.uid),{theme},{merge:true});theme_dialog.close()}catch(error){console.error(error)}}));dialog.querySelectorAll(".avatar-choice").forEach(b=>b.addEventListener("click",()=>select(b.dataset.avatar)));
dialog.querySelector(".profile-form").addEventListener("submit",async e=>{e.preventDefault();if(!current_user)return;const display_name=input.value.trim();if(!display_name)return;message.textContent="Saving...";try{await setDoc(doc(db,"users",current_user.uid),{display_name,profile_avatar:selected_avatar},{merge:true});render(display_name,selected_avatar);message.textContent="Profile saved.";setTimeout(()=>dialog.close(),450)}catch(error){console.error(error);message.textContent="Unable to save profile."}});
onAuthStateChanged(auth,async user=>{if(!user){window.location.href="../index.html";return}current_user=user;const fallback=user.email?.split("@")[0]||"Account";try{const snap=await getDoc(doc(db,"users",user.uid)),profile=snap.exists()?snap.data():{};const display_name=profile.display_name||fallback;selected_avatar=avatars.includes(profile.profile_avatar)?profile.profile_avatar:default_avatar;selected_theme=profile.theme||"stellaz";apply_theme(selected_theme);input.value=display_name;select(selected_avatar);render(display_name,selected_avatar)}catch(error){console.error(error);apply_theme("stellaz");input.value=fallback;render(fallback,default_avatar)}await load_notifications();if(notification_timer)clearInterval(notification_timer);notification_timer=setInterval(()=>load_notifications({mark_seen:!notification_panel.hidden}),60000)});
}