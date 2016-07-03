/*global declare, it, describe, beforeEach, afterEach*/
import { expect, chai } from "mocha-es6";
import { WorldMorph, Renderer } from "../index.js";
import { pt, Color } from "lively.graphics";
import { EventDispatcher } from "../events.js";


describe("morphic", () => {

  var world, submorph1, submorph2, submorph3,
      renderer, eventDispatcher,
      mousedownEvent;

  beforeEach(() => {
    world = new WorldMorph({
      name: "world", extent: pt(300,300),
      submorphs: [{
          name: "submorph1", extent: pt(100,100), position: pt(10,10), fill: Color.red,
          submorphs: [{name: "submorph2", extent: pt(20,20), position: pt(5,10), fill: Color.green}]
        },
        {name: "submorph3", extent: pt(50,50), position: pt(200,20), fill: Color.yellow}
      ]
    })
    submorph1 = world.submorphs[0];
    submorph2 = world.submorphs[0].submorphs[0];
    submorph3 = world.submorphs[1];

    renderer = new Renderer(world, document.body)
    renderer.renderWorld();

    eventDispatcher = new EventDispatcher(window, world).install();

    mousedownEvent = {
      type: "pointerdown",
      target: renderer.getNodeForMorph(submorph2),
      pointerId: "test-pointer-1"
    }
  });

  afterEach(() => {
    eventDispatcher && eventDispatcher.uninstall();
    renderer && renderer.clear();
  });

  it("mousedown on submorph", () => {
    eventDispatcher.dispatchEvent(fakeEvent(submorph2, "pointerdown"));
    expect(eventLog).deep.equals(["onMouseDown-world", "onMouseDown-submorph1", "onMouseDown-submorph2"]);
  });

  it("stop event", () => {
    submorph1.onMouseDown = function(evt) { evt.stop(); eventLog.push("onMouseDown-submorph1"); }
    eventDispatcher.dispatchEvent(fakeEvent(submorph2, "pointerdown"));
    expect(eventLog).deep.equals(["onMouseDown-world", "onMouseDown-submorph1"]);
  });

  it("world has hand and moves it", () => {
    eventDispatcher.dispatchEvent(fakeEvent(submorph2, "pointermove", pt(120,130)));
    expect(world.submorphs[0]).property("isHand", true);
  });

  it("drag morph", () => {
    // eventDispatcher.dispatchEvent(fakeEvent("pointerdown", submorph2));
    // expect(log).deep.equals(["world", "submorph1", "submorph2"]);
  });

});