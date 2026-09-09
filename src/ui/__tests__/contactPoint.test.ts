import { describe, expect, it } from 'vitest';
import { contactPoint } from '../contactPoint';
describe('contactPoint', () => {
  it('places sparks in the actual overlap rather than at the attacker center', () => {
    expect(contactPoint([{x: 90,y: 20,width: 40,height: 20}], [{x: 110,y: 10,width: 30,height: 50}], {x: 0,y: 0})).toEqual({x:120,y:30});
  });
  it('uses the victim body for projectile and grab events without a melee box', () => {
    expect(contactPoint([], [{x: 100,y: 30,width: 20,height: 80}], {x: 0,y: 0})).toEqual({x:110,y:70});
  });
  it('does not treat touching edges as a hit and supports empty poses', () => {
    expect(contactPoint([{x: 0,y: 0,width: 10,height: 10}], [{x: 10,y: 0,width: 10,height: 10}], {x: 0,y: 0})).toEqual({x:15,y:5});
    expect(contactPoint([], [], {x: 5,y: 8})).toEqual({x:5,y:8});
  });
});
