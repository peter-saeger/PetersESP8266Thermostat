#ifndef THERMOSTAT_LOGIC_H
#define THERMOSTAT_LOGIC_H

class ThermostatLogic {
public:
    static const int TEMP_SMOOTHING_COUNT = 10;
    
    ThermostatLogic();

    // Setters
    void setBounds(float low, float high);
    void resetSmoothing(float initialTemp);
    
    // Getters
    float getCurrentTemp() const;
    float getAverageTemp() const;
    bool isHeating() const;
    float getLowBound() const;
    float getHighBound() const;

    // Core Logic
    void addTemperatureReading(float tempRead);
    bool updateRelayState(); // Returns true if state changed

private:
    float currentTempRead;
    float tempReadings[TEMP_SMOOTHING_COUNT];
    int tempReadIndex;
    float tempReadingsTotal;
    float currentAverageTemp;
    
    float lowTemp;
    float highTemp;
    bool relayON;
};

#endif // THERMOSTAT_LOGIC_H
