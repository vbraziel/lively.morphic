/*global declare, it, describe, beforeEach, afterEach, before, after*/
import { createDOMEnvironment } from "../rendering/dom-helper.js";
import { MorphicEnv, show } from "../index.js";
import { expect } from "mocha-es6";
import { morph } from "../index.js";
import { pt, Color, Rectangle } from "lively.graphics";
import { num, promise, fun } from "lively.lang";

var world, submorph1, submorph2, submorph3, eventDispatcher;
function createDummyWorld() {
  world = morph({
    type: "world", name: "world", extent: pt(1000,1000),
    submorphs: [{
        name: "submorph1", extent: pt(100,100), position: pt(10,10), fill: Color.red,
        submorphs: [{name: "submorph2", extent: pt(20,20), position: pt(5,10), fill: Color.green}]
      }, {
         name: "submorph3", extent: pt(100,100), position: pt(400,400), fill: Color.blue,
      }]
  });
  submorph1 = world.submorphs[0];
  submorph2 = submorph1.submorphs[0];
  submorph3 = world.get("submorph3");
  return world;
}

function closeToPoint(p1,p2) {
  var {x,y} = p1;
  expect(x).closeTo(p2.x, 0.1, "x");
  expect(y).closeTo(p2.y, 0.1, "y");
}


describe("halos", () => {

  beforeEach(async () =>
    MorphicEnv.pushDefault(
      new MorphicEnv(await createDOMEnvironment()))
        .setWorld(createDummyWorld()));

  afterEach(() =>  MorphicEnv.popDefault().uninstall());


  it("halo items are placed correctly", async () => {
    submorph1.origin = pt(20,30);
    submorph1.position = pt(100,100);
    var halo = await world.showHaloFor(submorph1),
        _ = await halo.whenRendered(),
        _ = await promise.delay(),
        innerButton = halo.buttonControls
          .filter(item => item != halo.originHalo() && !item.isResizeHandle && item != halo.borderBox)
          .find(item => submorph1.globalBounds().containsPoint(item.globalBounds().center()));
    expect(innerButton).equals(undefined, `halo item ${innerButton && innerButton.name} is inside the bounds of its target`);
    expect(halo.originHalo().globalBounds().center()).equals(submorph1.worldPoint(pt(0,0)));
  });
  
  it("halo items never overlap each other", async () => {
    submorph1.origin = pt(20,30);
    submorph1.extent = pt(20,20);
    var halo = await world.showHaloFor(submorph1),
        _ = await halo.whenRendered(),
        _ = await promise.delay(),
        innerButton = halo.buttonControls.find(item =>
          halo.buttonControls.find(otherItem => 
            otherItem != item && !otherItem.isHandle && otherItem != halo.borderBox &&
            otherItem.globalBounds().intersects(item.globalBounds()))
          && item != halo.originHalo() && !item.isHandle && item != halo.borderBox);
    expect(innerButton).equals(undefined, `halo item ${innerButton} is inside the bounds of its target`);
  });

  it("can select multiple morphs", async () => {
     var halo = await world.showHaloForSelection([submorph1, submorph2]);
     await halo.whenRendered(); await promise.delay();
     expect(halo.target.selectedMorphs).equals([submorph1, submorph2]);
     expect(halo.borderBox.globalBounds()).equals(submorph1.globalBounds().union(submorph2.globalBounds()));
  });

  it("can select and deselect morphs from selection", async () => {
    var halo = await world.showHaloForSelection([submorph1, submorph2]);
    halo = await halo.addMorphToSelection(submorph3);
    await halo.whenRendered(); await promise.delay();
    expect(halo.target.selectedMorphs).equals([submorph1, submorph2, submorph3]);
    expect(halo.borderBox.globalBounds()).equals(submorph1.globalBounds()
                                 .union(submorph2.globalBounds())
                                 .union(submorph3.globalBounds()));
    halo = await halo.removeMorphFromSelection(submorph2);
    await halo.whenRendered(); await promise.delay();
    expect(halo.target.selectedMorphs).equals([submorph1, submorph3]);
    expect(halo.borderBox.globalBounds()).equals(
                                  submorph1.globalBounds()
                                 .union(submorph3.globalBounds()));
  })

  it("name shows name", async () => {
    var halo = await world.showHaloFor(submorph1);
    await halo.whenRendered(); await promise.delay();
    expect(halo.nameHalo().nameHolders[0].submorphs[0].textString).equals(submorph1.name);
  })

  it("drag drags", async () => {
    var halo = await world.showHaloFor(submorph1);
    await halo.whenRendered(); await promise.delay();
    halo.dragHalo().init();
    halo.dragHalo().update(pt(10,5));
    expect(submorph1.position).equals(pt(20, 15));
  });

  it("drags correctly of owner is transformed", async () => {
    var halo = await world.showHaloFor(submorph2);
    await halo.whenRendered(); await promise.delay();
    submorph2.owner.rotateBy(45);
    const prevGlobalPos = submorph2.globalPosition;
    halo.dragHalo().init();
    halo.dragHalo().update(pt(10,5));
    expect(submorph2.globalPosition).equals(prevGlobalPos.addXY(10,5));
  })
  
  it("drags gridded and shows guides", async () => {
    var halo = await world.showHaloFor(submorph1);
    halo.dragHalo().init();
    halo.dragHalo().update(pt(10,11), true);
    await halo.whenRendered(); await promise.delay();
    expect(submorph1.position).equals(pt(20, 20));
    var mesh = halo.getSubmorphNamed("mesh");
    expect(mesh).not.to.be.null;
    expect(mesh.vertical).not.to.be.null;
    expect(mesh.horizontal).not.to.be.null;
    halo.dragHalo().stop();
    expect(mesh.owner).to.be.null;
  });

  it("active drag hides other halos and displays position", async () => {
    var halo = await world.showHaloFor(submorph1),
        dragHalo = halo.dragHalo(),
        otherHalos = halo.buttonControls.filter((b) => b != dragHalo && !b.isHandle)
    dragHalo.init();
    halo.alignWithTarget();
    expect(halo.state.activeButton).equals(dragHalo);
    expect(halo.propertyDisplay.displayedValue()).equals(submorph1.position.toString());
    otherHalos.forEach((h) => expect(h).to.have.property("visible", false));
  })

  it("resize resizes", async () => {
    var halo = await world.showHaloFor(submorph1),
        resizeHandle = halo.ensureResizeHandles().find(h => h.corner == "bottomRight");
    resizeHandle.init(pt(0,0))
    resizeHandle.update(pt(10,5));
    expect(submorph1.extent).equals(pt(110, 105));
  });

  it("resizes correctly if transformation present", async () => {
    submorph1.rotation = num.toRadians(-45);
    var halo = await world.showHaloFor(submorph1),
        resizeHandle = halo.ensureResizeHandles().find(h => h.corner == "bottomCenter");
    resizeHandle.init(pt(0,0))
    resizeHandle.update(pt(10,10));
    expect(submorph1.extent).equals(pt(100, 100 + pt(10,10).r()));
  });

  it("align to the morph extent while resizing", async () => {
    submorph1.origin = pt(20,30);
    submorph1.position = pt(100,100);
    var halo = await world.showHaloFor(submorph1, "test-pointer-1"),
        resizeButton = halo.ensureResizeHandles().find(h => h.corner == "bottomRight"),
        resizeButtonCenter = resizeButton.globalBounds().center();
    resizeButton.init(pt(0,0));
    resizeButton.update(pt(42,42));
    expect(halo.borderBox.extent).equals(submorph1.extent);
  });

  it("active resize hides other halos and displays extent", async () => {
    var halo = await world.showHaloFor(submorph1),
        resizeHalo = halo.ensureResizeHandles().find(h => h.corner == "bottomRight"),
        otherHalos = halo.buttonControls.filter((b) => 
            b != resizeHalo && !b.isHandle 
            && b != halo.propetyDisplay);
    resizeHalo.init();
    halo.alignWithTarget();
    expect(halo.state.activeButton).equals(resizeHalo);
    expect(halo.propertyDisplay.displayedValue()).equals("100.0x100.0");
    otherHalos.forEach((h) => expect(h).to.have.property("visible", false));
  });

  it("resizes proportionally", async () => {
    var halo = await world.showHaloFor(submorph1),
        resizeHandle = halo.ensureResizeHandles().find(h => h.corner == "bottomRight");
    resizeHandle.init(pt(0,0), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
    resizeHandle.update(pt(10,5), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
    resizeHandle.update(pt(1000,500), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
    resizeHandle = halo.ensureResizeHandles().find(h => h.corner == "rightCenter");
    resizeHandle.init(pt(0,0), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
    resizeHandle.update(pt(10,5), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
    resizeHandle.update(pt(1000,500), true);
    expect(submorph1.extent.x).equals(submorph1.extent.y);
  });

  it("shows a visual guide when resizing proportionally", async () => {
    var halo = await world.showHaloFor(submorph1),
        resizeHandle = halo.ensureResizeHandles().find(h => h.corner == "bottomRight");
    resizeHandle.init(pt(0,0), true);
    resizeHandle.update(pt(10,5), true);
    var d = halo.getSubmorphNamed("diagonal");
    expect(d).to.not.be.undefined;
  });

  it("rotate rotates", async () => {
    var halo = await world.showHaloFor(submorph1);
    submorph1.rotation = num.toRadians(10);
    halo.rotateHalo().init(num.toRadians(10));
    halo.rotateHalo().update(num.toRadians(10));
    expect(submorph1.rotation).closeTo(num.toRadians(10), 0.1);
    halo.rotateHalo().update(num.toRadians(25));
    expect(submorph1.rotation).closeTo(num.toRadians(25), 0.1);
  });
  
  it("rotate does not align to Halo while active", async () => {
    var halo = await world.showHaloFor(submorph1);
    submorph1.rotation = num.toRadians(10);
    halo.rotateHalo().init(num.toRadians(10));
    halo.rotateHalo().position = pt(55,55);
    halo.rotateHalo().update(num.toRadians(10));
    expect(halo.rotateHalo().position).equals(pt(55,55));
    halo.rotateHalo().stop();
    expect(halo.rotateHalo().position).not.equals(pt(55,55));
  })

  it("rotate snaps to 45 degree angles", async () => {
    var halo = await world.showHaloFor(submorph1);
    halo.rotateHalo().init(num.toRadians(10));
    halo.rotateHalo().update(num.toRadians(52));
    expect(submorph1.rotation).equals(num.toRadians(45));
  });

  it("indicates rotation", async () => {
    var halo = await world.showHaloFor(submorph1),
        rh = halo.rotateHalo(),
        oh = halo.originHalo();
    rh.init(num.toRadians(10));
    rh.update(num.toRadians(25));
    const ri = halo.getSubmorphNamed("rotationIndicator");
    expect(ri).to.not.be.undefined;
    expect(ri.vertices.map(({x,y}) => ri.worldPoint(pt(x,y))))
      .equals([oh.globalBounds().center(), rh.globalBounds().center()]);
  });

  it("scale scales", async () => {
    var halo = await world.showHaloFor(submorph1);
    halo.rotateHalo().initScale(pt(10,10));
    halo.rotateHalo().updateScale(pt(20,20));
    expect(submorph1.scale).equals(2);
  });

  it("scale snaps to factors of 0.5", async () => {
    var halo = await world.showHaloFor(submorph1);
    halo.rotateHalo().initScale(pt(10,10));
    halo.rotateHalo().updateScale(pt(19.5,19.5));
    expect(submorph1.scale).equals(2);
  });

  it("indicates scale", async () => {
    var halo = await world.showHaloFor(submorph1),
        rh = halo.rotateHalo(),
        oh = halo.originHalo();
    rh.initScale(pt(10,10));
    rh.updateScale(pt(20,20));
    const ri = halo.getSubmorphNamed("rotationIndicator");
    expect(ri).to.not.be.undefined;
    expect(ri.vertices.map(({x,y}) =>
            ri.worldPoint(pt(x,y)))).equals(
              [oh.globalBounds().center(), rh.globalBounds().center()]);
  });

  it("active rotate halo hides other halos and displays rotation", async () => {
    var halo = await world.showHaloFor(submorph1),
        rotateHalo = halo.rotateHalo(),
        otherHalos = halo.buttonControls.filter((b) => b != rotateHalo);
    rotateHalo.init();
    halo.alignWithTarget();
    expect(halo.state.activeButton).equals(rotateHalo);
    expect(halo.propertyDisplay.displayedValue()).equals("0.0°");
    otherHalos.forEach((h) => {
      expect(h).to.have.property("visible", false);
    });
  })

  it("close removes", async () => {
    var halo = await world.showHaloFor(submorph1);
    halo.closeHalo().update();
    expect(submorph1.owner).equals(null);
  });

  it("origin shifts origin", async () => {
    submorph1.origin = pt(20,30);
    var halo = await world.showHaloFor(submorph1);
    halo.originHalo().update(pt(10,5));
    expect(submorph1.origin).equals(pt(30, 35));
    expect(halo.originHalo().globalBounds().center()).equals(submorph1.worldPoint(pt(0,0)));
  });

  it("origin shifts origin according to global delta", async () => {
    submorph1.position = pt(200,100);
    submorph1.rotateBy(num.toRadians(90));
    var halo = await world.showHaloFor(submorph1);
    halo.originHalo().update(pt(20,5));
    expect(submorph1.origin).equals(pt(5, -20));
  });

  it("shifting the origin will not move bounds", async () => {
    submorph1.position = pt(200,100);
    submorph1.rotateBy(num.toRadians(90));
    var oldGlobalPos = submorph1.globalBounds().topLeft();
    var halo = await world.showHaloFor(submorph1);
    halo.originHalo().update(pt(20,5));
    expect(submorph1.origin).equals(pt(5, -20));
    expect(submorph1.globalBounds().topLeft()).equals(oldGlobalPos);

    submorph1.rotation = num.toRadians(-42);
    oldGlobalPos = submorph2.globalBounds().topLeft();
    halo = await world.showHaloFor(submorph2);
    halo.originHalo().update(pt(20,5));
    closeToPoint(submorph2.globalBounds().topLeft(), oldGlobalPos);

    submorph2.rotation = num.toRadians(-20);
    oldGlobalPos = submorph2.globalBounds().topLeft();
    halo = await world.showHaloFor(submorph2);
    halo.originHalo().update(pt(20,5));
    closeToPoint(submorph2.globalBounds().topLeft(), oldGlobalPos);
  });

  it("shifting the origin will not move submorphs", async () => {
    submorph1.position = pt(200,100);
    submorph1.rotateBy(num.toRadians(90));
    var halo = await world.showHaloFor(submorph1);
    var oldGlobalPos = submorph2.globalPosition;
    halo.originHalo().update(pt(20,5));
    closeToPoint(submorph2.globalPosition, oldGlobalPos);
  });

  it("origin halo aligns correctly if owner is transformed", async () => {
    var halo = await world.showHaloFor(submorph2);
    submorph1.rotation = num.toRadians(-45);
    submorph2.rotation = num.toRadians(-45);
    halo.alignWithTarget();
    expect(submorph2.worldPoint(submorph2.origin)).equals(halo.originHalo().globalBounds().center());
  });

  it("origin halo aligns correctly if morph is transformed with different origin", async () => {
    var halo = await world.showHaloFor(submorph1);
    submorph1.adjustOrigin(submorph1.innerBounds().center());
    submorph1.rotation = num.toRadians(-45);
    halo.alignWithTarget();
    var originHaloCenter = halo.originHalo().globalBounds().center(),
        originWorldPos = submorph1.worldPoint(pt(0,0));
    closeToPoint(originHaloCenter, originWorldPos);
  });

  it("origin halo aligns correctly if owner is transformed with different origin", async () => {
    var halo = await world.showHaloFor(submorph2);
    submorph1.adjustOrigin(submorph2.innerBounds().center());
    submorph2.adjustOrigin(submorph2.innerBounds().center());
    submorph1.rotation = num.toRadians(-45);
    submorph2.rotation = num.toRadians(-45);
    halo.alignWithTarget();
    var originHaloCenter = halo.originHalo().globalBounds().center(),
        originWorldPos = submorph2.worldPoint(pt(0,0));
    closeToPoint(originHaloCenter, originWorldPos);
  });

  it("grab grabs", async () => {
    var halo = await world.showHaloFor(submorph2),
        hand = world.handForPointerId("test-pointer");
    halo.grabHalo().init(hand)
    hand.update({halo, position: submorph1.globalBounds().center()});
    expect(halo.borderBox.globalPosition).equals(submorph2.globalBounds().topLeft());
    expect(submorph2.owner).equals(hand);
    halo.grabHalo().stop(hand)
    expect(halo.borderBox.globalPosition).equals(submorph2.globalBounds().topLeft());
    expect(submorph2.owner).equals(submorph1);
  });

  it("copy copies", async () => {
    var halo = await world.showHaloFor(submorph2),
        hand = world.handForPointerId("test-pointer");
    halo.copyHalo().init(hand)
    var copy = halo.target;
    expect(copy).not.equals(submorph2);
    hand.position = submorph1.globalBounds().center();
    halo.copyHalo().stop(hand)
    expect(halo.borderBox.globalPosition).equals(copy.globalBounds().topLeft());
    expect(copy.owner).equals(submorph1);
  });

});
