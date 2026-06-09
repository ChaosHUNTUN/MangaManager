using System.Globalization;
using System.Windows.Data;

namespace MangaManager.Console;

/// <summary>将百分比(0-100)转为 GridLength 星号比例</summary>
public class ProgressToGridLengthConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var percent = value is double d ? d : 0;
        // 返回 GridLength：如 percent=100 则 100*, 0* 使进度条占满
        var progress = System.Math.Clamp(percent, 0, 100);
        return new System.Windows.GridLength(progress, System.Windows.GridUnitType.Star);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotImplementedException();
}
