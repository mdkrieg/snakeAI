if(!localStorage.hasOwnProperty("flows")){
    var flows = $("#defaultFlow").html();
    console.log("flows: ",flows);
    localStorage.setItem("flows",'{"flows":' + flows + '}')
}
$fakeajax = function(input){
    var data = input.data
    console.log("fakeajax",data);
    input.success();
}

// $("#red-ui-main-container").ready(()=>{
//     afterDeploy();
// })

function afterDeploy(){
    var flow = window.localStorage.getItem("flows");
    flow = JSON.parse(flow);
    flow = flow.flows;
    window.context.flow = flow
    window.context.nodes = flow.filter((x)=>{
        return x != "tab";
    })
    window.context.flows = flow.filter((x)=>{
        return x == "tab";
    })
    window.context.global = {};
    initFlow();
}

window.context = {
    flow: {},
    nodes: {},
    flows: {},
    global: {}
};
// window.node = 
// } // this is local to the function object

//not working correctly
// window.flow = {
//     set: function(id, ref, value){
//         context.flows = context.flows.map((x)=>{
//             if (x.id == id){
//                 x[ref] = value;
//             }
//             return x;
//         });
//     },
//     get: function(id, ref){
//         var node = getFlowById(id);
//         return node[ref];
//     }
// }
window.global = {
    set: function(ref, value){
        context.global[ref] = value;
    },
    get: function(ref){
        return context.global[ref];
    }
}
var embeddedFunctions = {};
const flowHandlers = {
    inject: function(node){
        var msg = {};
        for (var key of node.props){
            msg[key.p] = node[key.p];
        }
        send(node,msg);
    },
    listener: function(node,msg){
        msg = {};
        document.querySelector(node.query).addEventListener(node.trigger,()=>{send(node.wires[0],msg);});
    },
    template: function(node,msg){
        msg.payload = node.template;
        send(node,msg);
    },
    transform: function(node,msg){
        // var $template = $(msg.payload);
        var inputs;
        if(!msg.hasOwnProperty("inputs")){
            inputs = {};
        }else{
            inputs = msg.inputs;
        }
        var transX = inputs.translateX || node.translateX;
        var transY = inputs.translateY || node.translateY;
        var scaleX = inputs.scaleX || node.scaleX;
        var scaleY = inputs.scaleY || node.scaleY;
        var rotate = inputs.rotate || node.rotate || 0;
        msg.transform = `translate(${transX},${transY}) scale(${scaleX},${scaleY}) rotate(${rotate})`;
        // $template.attr("transform", transformString);
        // msg.payload = $getHTML($template);
        send(node,msg);
    },
    append: function(node,msg){
        // var content = msg.payload;
        // msg.query = node.query;
        msg.topic = "append";
        // if(!msg.hasOwnProperty("_stack")){
        //     msg._stack = [];
        // }
        // msg._stack.push((caller_node)=>{
        //     $("#" + caller_node.id + " .inlineview " + query).append(content);
        // });
        send(node,msg)
    },
    addclass: function(node,msg){
        if(!msg.hasOwnProperty("addclass")){
            msg.addclass = [];
        }
        msg.addclass.push(node.class);
        send(node,msg)
    },
    function: function(node,msg){
        node.send = (evalmsg)=>{
            send(node, evalmsg);
        };
        node.set = function(ref, value){
            context.nodes = context.nodes.map((x)=>{
                if (x.id == node.id){
                    x[ref] = value;
                }
                return x;
            });
        }
        node.get = function(ref){
            var n = getNodeById(node.id);
            return n[ref];
        }
        var evalString = "(node,msg)=>{"+node.func+"}";
        try{
            var executeCode = eval(evalString);
            outmsg = executeCode(node,msg);
            send(node,outmsg);
        }catch(err){
            console.log(node.id, err.message)
            if(!RED.notifyFilter){
                RED.notify("function error: " + node.id + "\n" + err.message)
                RED.notifyFilter = true;
                setTimeout(()=>{RED.notifyFilter=false;},5000);
            }
        }
    },
    file: function(node,msg){
        var content = msg.payload;
        var c = document.createElement("a");
        c.download = node.filename;

        var t = new Blob([content], {
            type: "text/plain"
        });
        c.href = window.URL.createObjectURL(t);
        c.click();
        send(node,msg);
    },
    http_request: function(node,msg){
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open( "GET", node.url, false ); // false for synchronous request
        xmlHttp.send( null );
        var response = xmlHttp.responseText;
        send(node,response);
    },
    debug: function(node,msg){
        console.log(msg);
    },
    svg_rect: function(node, msg){
        // console.log("rect:", node, msg)
        if(msg.topic == "append"){
            var $target = $("#" + node.id + " .inlineview .container")
            var $clone = $("#" + msg.payload + " .inlineview > *").clone();
            if(msg.hasOwnProperty("data")){
                for(var key in msg.data){
                    $clone.attr("data-" + key, msg.data[key]);
                }
            }
            if(msg.hasOwnProperty("addclass")){
                $clone.addClass(msg.addclass.join(" "));
            }
            $clone.attr("transform", msg.transform || "");
            // console.log("append exec: ", msg.payload, $target);
            $target.append($clone);
            msg.payload = node.id;
            send(node,msg);
            // msg._stack.forEach((item)=>{
            //     console.log("STACK: ", node, msg)
            //     item(node, msg);
            // })
        }else{
            RED.nodes.filterNodes(1).filter((x)=>{
                return ["svg-rect"].includes(x.type);
            }).forEach((n)=>{
                drawSVG(n, node.class || false);
            });
        }
    },
    inlinesvg: function(node, msg){
        RED.nodes.filterNodes(1).filter((x)=>{
            return ["inlinesvg"].includes(x.type);
        }).forEach((n)=>{
            drawSVG(n);
        });
        if(typeof msg === "object"){
            // msg.payload = node.template;
            msg.payload = node.id;
            send(node, msg);
        }
    }
};

function drawSVG(node, inheritClass = false){
    switch(node.type){
        case "svg-rect":
            // console.log(id)
            var id = node.id
            // var node = context.nodes.filter((x)=>{return x.id == id})[0];
            // console.log(node)
            // console.log(this)
            var fill = $("#node-input-fill").val() || node.fill;
            var stroke = $("#node-input-stroke").val() || node.stroke;
            var strokewidth = $("#node-input-strokewidth").val() || node.strokewidth;
            var width = $("#node-input-width").val() || node.width;
            var height = $("#node-input-height").val() || node.height;
            var drawx = $("#node-input-drawx").val() || node.drawx;
            var drawy = $("#node-input-drawy").val() || node.drawy;
            var template = $("#node-input-template").val() || node.template;
            $("#" + id + " .inlineview").remove()
            var svgg = document.createElementNS("http://www.w3.org/2000/svg", "g");
            svgg.setAttribute("transform", "translate(2,35)");
            svgg.setAttribute("class", "inlineview");
            var svgdefs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            if(fill == "pattern"){
                var $pattern = $(template);
                $pattern.attr("id", id + "pattern");
                fill = `url(#${id}pattern)`;
                svgdefs.innerHTML = $("<div>").append($pattern).html();
                svgg.appendChild(svgdefs);
            }
            var svgpart = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            svgpart.setAttribute("fill", fill);
            svgpart.setAttribute("stroke", stroke);
            svgpart.setAttribute("stroke-width", strokewidth);
            svgpart.setAttribute("width", width);
            svgpart.setAttribute("height", height);
            svgpart.setAttribute("x", drawx);
            svgpart.setAttribute("y", drawy);
            var svgcont = document.createElementNS("http://www.w3.org/2000/svg", "g");
            if(inheritClass){
                svgcont.setAttribute("class","container " + inheritClass);
            }else{
                svgcont.setAttribute("class","container");
            }
            svgcont.setAttribute("width", width);
            svgcont.setAttribute("height", height);
            svgg.appendChild(svgpart);
            svgg.appendChild(svgcont);
            // console.log(id)
            document.getElementById(id).appendChild(svgg);
            break;
        case "inlinesvg":
            var id = node.id;
            $("#" + id + " .inlineview").remove()
            var svgg = document.createElementNS("http://www.w3.org/2000/svg", "g");
            svgg.setAttribute("transform", "translate(2,35)");
            svgg.setAttribute("class", "inlineview inlinesvg");
            svgg.innerHTML = node.template;
            document.getElementById(node.id).appendChild(svgg);
            break;
    }
}
// function attachListeners(){
//     var listeners = flow.filter(x=>{
//         return x.type == "listener";
//     });
//     listeners.forEach(flowHandlers.listener);
// }
var intervals = [];
function initFlow(){
    intervals.forEach((i)=>{
        clearInterval(i)
    });
    initSVG();
    getNodesByType("inject").forEach((node)=>{
        if(node.repeat == "" && node.once === false) return false;
        if(node.repeat != ""){
            var repeat = +node.repeat;
            var interval = setInterval(()=>{
                flowHandlers.inject(node);
            }, repeat * 1000);
            intervals.push(interval);
        }
        if(node.once === true){
            var delay = +node.onceDelay;
            setTimeout(()=>{
                flowHandlers.inject(node);
            }, delay * 1000);
        }
    })
}
function initSVG(){
    getNodesByType("svg-rect").forEach(flowHandlers.svg_rect);
    getNodesByType("inlinesvg").forEach(flowHandlers.inlinesvg);
}
function $getHTML($inp){
    return $("<div>").append($inp).html();
}
function getNodesByType(type){
    return context.nodes.filter(x=>{
        return x.type == type;
    });
}
function getNodeById(id){
    return context.nodes.filter(x=>{
        return x.id == id;
    }).pop();
}
function getFlowById(id){
    return context.flows.filter(x=>{
        return x.id == id;
    }).pop();
}
function send(sendingnode,msg){
    if(Array.isArray(msg)){
        for( var i in msg){
            if(msg[i] !== null){
                wire(i, msg[i]);
            }
        }
    }else{
        wire(0, msg);
    }
    function wire(id, m){
        if(m === null) return;
        var ids = sendingnode.wires[id];
        ids.forEach(xid=>{
            var node = getNodeById(xid);
            var type = node.type.split(" ").join("_");
            type = type.split("-").join("_");
            m = JSON.parse(JSON.stringify([m]))[0];
            flowHandlers[type](node,m);
            // window.node.get("input")(node,msg);
        })
    }
}
