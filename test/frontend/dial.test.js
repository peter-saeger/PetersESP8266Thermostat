const { valToXY, xyToVal } = require('../../data/app.js');

describe('Thermostat Circular Dial Math', () => {
  test('valToXY: Minimum bound (40) maps to bottom-left (225 deg)', () => {
    const { x, y } = valToXY(40);
    // 225 deg from top clockwise. sin(225)=-0.707, cos(225)=-0.707
    // X = 100 + 66 * (-0.707) = 53.38
    // Y = 100 - 66 * (-0.707) = 146.62
    expect(x).toBeCloseTo(53.38, 1);
    expect(y).toBeCloseTo(146.62, 1);
  });

  test('valToXY: Maximum bound (90) maps to bottom-right (135 deg / 495 deg)', () => {
    const { x, y } = valToXY(90);
    // 495 deg from top clockwise (or 135 deg). sin(135)=0.707, cos(135)=-0.707
    // X = 100 + 66 * (0.707) = 146.62
    // Y = 100 - 66 * (-0.707) = 146.62
    expect(x).toBeCloseTo(146.62, 1);
    expect(y).toBeCloseTo(146.62, 1);
  });

  test('valToXY: Middle bound (65) maps to top-center (360 deg / 0 deg)', () => {
    const { x, y } = valToXY(65);
    // Top center -> X=100, Y=34
    expect(x).toBeCloseTo(100, 1);
    expect(y).toBeCloseTo(34, 1);
  });

  test('xyToVal: Bottom-left maps back to 40', () => {
    const val = xyToVal(53.38, 146.62);
    expect(val).toBeCloseTo(40, 1);
  });

  test('xyToVal: Bottom-right maps back to 90', () => {
    const val = xyToVal(146.62, 146.62);
    expect(val).toBeCloseTo(90, 1);
  });

  test('xyToVal: Top-center maps back to 65', () => {
    const val = xyToVal(100, 34);
    expect(val).toBeCloseTo(65, 1);
  });

  test('Reversibility check', () => {
    for (let testVal = 40; testVal <= 90; testVal += 5) {
      const { x, y } = valToXY(testVal);
      const computedVal = xyToVal(x, y);
      expect(computedVal).toBeCloseTo(testVal, 2);
    }
  });
});
