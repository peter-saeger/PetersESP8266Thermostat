#include "ThermostatLogic.h"
#include <cmath> // for isnan

ThermostatLogic::ThermostatLogic() 
    : currentTempRead(60.0), tempReadIndex(0), tempReadingsTotal(60.0 * TEMP_SMOOTHING_COUNT), 
      currentAverageTemp(60.0), lowTemp(50.0), highTemp(65.0), relayON(false) {
    for (int i = 0; i < TEMP_SMOOTHING_COUNT; i++) {
        tempReadings[i] = 60.0;
    }
}

void ThermostatLogic::setBounds(float low, float high) {
    if (low < high) {
        lowTemp = low;
        highTemp = high;
    }
}

void ThermostatLogic::resetSmoothing(float initialTemp) {
    currentTempRead = initialTemp;
    currentAverageTemp = initialTemp;
    tempReadingsTotal = initialTemp * TEMP_SMOOTHING_COUNT;
    for (int i = 0; i < TEMP_SMOOTHING_COUNT; i++) {
        tempReadings[i] = initialTemp;
    }
}

float ThermostatLogic::getCurrentTemp() const { return currentTempRead; }
float ThermostatLogic::getAverageTemp() const { return currentAverageTemp; }
bool ThermostatLogic::isHeating() const { return relayON; }
float ThermostatLogic::getLowBound() const { return lowTemp; }
float ThermostatLogic::getHighBound() const { return highTemp; }

void ThermostatLogic::addTemperatureReading(float tempRead) {
    if (std::isnan(tempRead)) {
        return; // Ignore NaN readings
    }
    currentTempRead = tempRead;

    tempReadingsTotal -= tempReadings[tempReadIndex];
    tempReadings[tempReadIndex] = tempRead;
    tempReadingsTotal += tempReadings[tempReadIndex];
    
    tempReadIndex = (tempReadIndex + 1) % TEMP_SMOOTHING_COUNT;
    currentAverageTemp = tempReadingsTotal / TEMP_SMOOTHING_COUNT;
}

bool ThermostatLogic::updateRelayState() {
    bool previousRelayState = relayON;

    if (relayON) {
        if (currentAverageTemp >= highTemp) {
            relayON = false;
        }
    } else {
        if (currentAverageTemp <= lowTemp) {
            relayON = true;
        }
    }

    return previousRelayState != relayON;
}
