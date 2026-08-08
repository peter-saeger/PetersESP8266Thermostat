const { valToXY, xyToVal } = require('../../data/app.js');

describe('Thermostat Circular Dial Math', () => {
  test('valToXY: Minimum bound (40) maps to bottom-left (225 deg)', () => {
    const { x, y } = valToXY(40);
    // 225 deg from top clockwise. sin(225)=-0.707, cos(225)=-0.707
    // X = 100 + 90 * (-0.707) = 36.36
    // Y = 100 - 90 * (-0.707) = 163.64
    expect(x).toBeCloseTo(36.36, 1);
    expect(y).toBeCloseTo(163.64, 1);
  });

  test('valToXY: Maximum bound (90) maps to bottom-right (135 deg / 495 deg)', () => {
    const { x, y } = valToXY(90);
    // 495 deg from top clockwise (or 135 deg). sin(135)=0.707, cos(135)=-0.707
    // X = 100 + 90 * (0.707) = 163.64
    // Y = 100 - 90 * (-0.707) = 163.64
    expect(x).toBeCloseTo(163.64, 1);
    expect(y).toBeCloseTo(163.64, 1);
  });

  test('valToXY: Middle bound (65) maps to top-center (360 deg / 0 deg)', () => {
    const { x, y } = valToXY(65);
    // Top center -> X=100, Y=10
    expect(x).toBeCloseTo(100, 1);
    expect(y).toBeCloseTo(10, 1);
  });

  test('xyToVal: Bottom-left maps back to 40', () => {
    const val = xyToVal(36.36, 163.64);
    expect(val).toBeCloseTo(40, 1);
  });

  test('xyToVal: Bottom-right maps back to 90', () => {
    const val = xyToVal(163.64, 163.64);
    expect(val).toBeCloseTo(90, 1);
  });

  test('xyToVal: Top-center maps back to 65', () => {
    const val = xyToVal(100, 10);
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
